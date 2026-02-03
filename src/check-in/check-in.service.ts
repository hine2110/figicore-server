import { Injectable, OnModuleInit, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as faceapi from 'face-api.js';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto'; // Native Node.js crypto for robust token generation
// Note: These imports require 'canvas' and '@tensorflow/tfjs' to be installed
import * as tf from '@tensorflow/tfjs';

const canvas = require('canvas');
const { Canvas, Image, ImageData, loadImage } = canvas;
faceapi.env.monkeyPatch({ Canvas: canvas.Canvas, Image: canvas.Image, ImageData: canvas.ImageData });

// Custom Exceptions
import {
    FaceNotDetectedException,
    FaceNotMatchedException,
    InvalidStationException,
    NoScheduleFoundException
} from './check-in.exceptions';

@Injectable()
export class CheckInService implements OnModuleInit {
    private readonly logger = new Logger(CheckInService.name);
    // Threshold for face matching (0.6 is standard for Euclidean distance)
    private readonly MATCH_THRESHOLD = 0.6;

    constructor(
        private prisma: PrismaService,
        private mailService: MailService
    ) { }

    async onModuleInit() {
        await this.loadModels();
    }

    private async loadModels() {
        this.logger.log('Initializing FaceAPI models...');

        // Monkey patch environment for Node.js
        faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

        // Load models from a local 'models' directory or public assets
        const modelPath = path.join(process.cwd(), 'public', 'models');

        if (!fs.existsSync(modelPath)) {
            this.logger.warn(`Model directory not found at ${modelPath}. Please ensure models are present.`);
            return;
        }

        try {
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
            this.logger.log('FaceAPI models loaded successfully');
        } catch (error) {
            this.logger.error('Failed to load FaceAPI models', error);
        }
    }

    // --- HELPER: Regex Time Extraction ---
    private extractTimeStr(isoString: string | Date | null): string | null {
        if (!isoString) return null;
        const str = isoString instanceof Date ? isoString.toISOString() : isoString;
        // Extracts HH:mm from "YYYY-MM-DDTHH:mm:ss..."
        const match = str.match(/T?(\d{2}:\d{2})/);
        return match ? match[1] : null;
    }

    /**
     * Step 0: Register Device/Station (NEW)
     */
    async registerStation(name: string, managerEmail: string) {
        if (!name) throw new BadRequestException('Station name is required');

        // Generate secure token (64 hex characters)
        const token = crypto.randomBytes(32).toString('hex');
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const station = await this.prisma.checkin_stations.create({
            data: {
                station_name: name,
                station_token: token,
                verification_token: verificationToken,
                is_active: false
            }
        });

        // 3. Tạo Link xác nhận
        // Giả sử Frontend chạy ở port 5173 (hoặc port bạn config)
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const confirmLink = `${baseUrl}/manager/station-confirm?token=${verificationToken}&action=approve`;
        const cancelLink = `${baseUrl}/manager/station-confirm?token=${verificationToken}&action=deny`;

        // 4. Gửi Email
        this.logger.log(`Sending verification email to: ${managerEmail}`);
        try {
            await this.mailService.sendStationVerificationEmail(
                managerEmail,
                station.station_name,
                confirmLink,
                cancelLink
            );
        } catch (error) {
            this.logger.error(`Failed to send email to ${managerEmail}`, error);
            // Optional: throw exception to inform client? 
            // Or just log it. Requirements say "Log the error".
        }

        this.logger.log(`Register request sent for: ${name}. Waiting for email confirmation.`);

        return {
            message: 'Verification email sent. Please check your inbox.',
            station_name: station.station_name,
            station_id: station.station_id
        };
    }

    async getStationStatus(id: number) {
        const station = await this.prisma.checkin_stations.findUnique({
            where: { station_id: id }
        });

        if (!station) {
            throw new BadRequestException('Station not found');
        }

        return {
            is_active: station.is_active,
            station_token: station.is_active ? station.station_token : null
        };
    }

    async confirmStation(token: string, action: 'approve' | 'deny') {
        const station = await this.prisma.checkin_stations.findUnique({
            where: { verification_token: token }
        });

        if (!station) {
            throw new BadRequestException('Invalid or expired verification token.');
        }

        if (action === 'approve') {
            const updatedStation = await this.prisma.checkin_stations.update({
                where: { station_id: station.station_id },
                data: {
                    is_active: true,
                    verification_token: null // Clear token to prevent reuse
                }
            });

            this.logger.log(`Station Approved: ${updatedStation.station_name}`);

            return {
                success: true,
                message: 'Station activated successfully',
                station_name: updatedStation.station_name,
                station_token: updatedStation.station_token
            };
        } else if (action === 'deny') {
            await this.prisma.checkin_stations.delete({
                where: { station_id: station.station_id }
            });

            this.logger.log(`Station Request Denied: ${station.station_name}`);

            return {
                success: true,
                message: 'Station request denied and removed.'
            };
        }

        throw new BadRequestException('Invalid action');
    }

    /**
     * Step 1: Register Face (Setup phase)
     */
    async registerFace(employeeId: number, imageUrl: string) {
        // 1. Fetch Image
        let image;
        try {
            image = await loadImage(imageUrl);
        } catch (e) {
            this.logger.error(`Failed to load image from ${imageUrl}`);
            throw new FaceNotDetectedException();
        }

        // 2. Detect Face & Compute Descriptor
        const detection = await faceapi.detectSingleFace(image as any)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new FaceNotDetectedException();
        }

        const descriptor = Array.from(detection.descriptor); // Float32Array to number[]

        // 3. Update Employee Record
        await this.prisma.employees.update({
            where: { user_id: employeeId },
            data: {
                face_descriptor: descriptor as any // Stored as JSON
            }
        });

        this.logger.log(`Registered face for employee ${employeeId}`);
        return { success: true, message: 'Face registered successfully' };
    }

    /**
     * Step 2: Verify Check-in (Main Flow)
     */
    async verifyCheckIn(dto: { employeeId: number; imageBase64: string; stationToken: string; checkinPayload?: any }) {
        const { employeeId, imageBase64, stationToken, checkinPayload } = dto;

        // --- Step 1: Device Validation ---
        const station = await this.prisma.checkin_stations.findFirst({
            where: {
                station_token: stationToken,
                is_active: true
            }
        });

        if (!station) {
            throw new InvalidStationException();
        }

        // --- Step 2: Face Matching ---
        const employee = await this.prisma.employees.findUnique({
            where: { user_id: employeeId },
            select: { face_descriptor: true, users: { select: { full_name: true } } }
        });

        if (!employee || !employee.face_descriptor) {
            throw new UnauthorizedException('Employee face data not found. Please register first.');
        }

        // Process Incoming Image (Base64)
        const base64Data = imageBase64.replace(/^data:image\/.*;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const image = await loadImage(imgBuffer);

        const detection = await faceapi.detectSingleFace(image as any)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new FaceNotDetectedException();
        }

        // Compare Descriptors
        const incomingDescriptor = detection.descriptor;

        // FIX: Ensure retrieved JSON is converted properly to Float32Array
        let savedDescriptorArray: number[] = [];
        if (Array.isArray(employee.face_descriptor)) {
            savedDescriptorArray = employee.face_descriptor as number[];
        } else if (typeof employee.face_descriptor === 'object') {
            // Handle case where Prisma returns object-like JSON (e.g. { '0': 0.1, ... })
            savedDescriptorArray = Object.values(employee.face_descriptor as any).map(Number);
        }

        const savedDescriptor = new Float32Array(savedDescriptorArray);

        const distance = faceapi.euclideanDistance(incomingDescriptor, savedDescriptor);

        this.logger.log(`Face Match Distance for ${employeeId}: ${distance}`);

        if (distance > this.MATCH_THRESHOLD) {
            throw new FaceNotMatchedException();
        }

        // --- Step 3: Attendance Recording ---
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Find Schedule
        const schedule = await this.prisma.work_schedules.findFirst({
            where: {
                user_id: employeeId,
                date: {
                    // Simple check: Schedule date must match today's date string
                    // Note: Prisma Date filter might be timezone specific, so use GTE/LT range if needed.
                    // Assuming 'date' field in DB is stored as pure date or 00:00 UTC
                    gte: new Date(todayStr + 'T00:00:00Z'),
                    lt: new Date(todayStr + 'T23:59:59Z')
                }
            }
        });

        if (!schedule) {
            throw new NoScheduleFoundException();
        }

        // Prevent Duplicate Check-in
        const existingTimesheet = await this.prisma.timesheets.findFirst({
            where: {
                schedule_id: schedule.schedule_id,
                check_in_at: { not: null } // Already checked in
            }
        });

        if (existingTimesheet) {
            return {
                success: true,
                timesheetId: existingTimesheet.timesheet_id,
                status: 'ALREADY_CHECKED_IN',
                employeeName: employee.users.full_name
            };
        }

        // Determine Status (LATE vs ON_TIME) - Absolute Timezone Strategy
        let statusCode = 'ON_TIME';
        let isFlagged = false;

        const expectedTimeStr = this.extractTimeStr(schedule.expected_start as any); // "08:00"

        if (expectedTimeStr) {
            // Construct Comparison Date using NOW'S Date components + SCHEDULE'S Time components
            // This ensures we compare apples to apples in local server time
            const [expHours, expMinutes] = expectedTimeStr.split(':').map(Number);

            // Create date object for TODAY at EXPECTED TIME
            const expectedDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), expHours, expMinutes, 0);

            // Add Grace Period (15 Minutes)
            const GRACE_PERIOD_MS = 15 * 60 * 1000;
            const limitTime = new Date(expectedDateTime.getTime() + GRACE_PERIOD_MS);

            this.logger.debug(`Time Check [${employeeId}]: Now=${now.toLocaleTimeString()} vs Limit=${limitTime.toLocaleTimeString()} (Exp: ${expectedTimeStr})`);

            if (now > limitTime) {
                statusCode = 'LATE';
                isFlagged = true;
            }
        } else {
            this.logger.warn(`Schedule logic: Missing expected_start for schedule ${schedule.schedule_id}`);
        }

        // Create Timesheet
        const newTimesheet = await this.prisma.timesheets.create({
            data: {
                schedule_id: schedule.schedule_id,
                station_id: station.station_id,
                check_in_at: now,
                status_code: statusCode,
                is_flagged: isFlagged,
                checkin_payload: checkinPayload || {},
                applied_hourly_rate: 0,
                real_work_hours: 0
            }
        });

        return {
            success: true,
            timesheetId: newTimesheet.timesheet_id,
            status: statusCode,
            employeeName: employee.users.full_name
        };
    }
    async verifyCheckOut(dto: { employeeId: number; imageBase64: string; stationToken: string }) {
        const { employeeId, imageBase64, stationToken } = dto;

        // --- Step 1: Device Validation ---
        const station = await this.prisma.checkin_stations.findFirst({
            where: {
                station_token: stationToken,
                is_active: true
            }
        });

        if (!station) {
            throw new InvalidStationException();
        }

        // --- Step 2: Face Matching ---
        const employee = await this.prisma.employees.findUnique({
            where: { user_id: employeeId },
            select: {
                face_descriptor: true,
                base_salary: true,
                users: { select: { full_name: true } }
            }
        });

        if (!employee || !employee.face_descriptor) {
            throw new UnauthorizedException('Employee face data not found.');
        }

        // Process Incoming Image
        const base64Data = imageBase64.replace(/^data:image\/.*;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const image = await loadImage(imgBuffer);

        const detection = await faceapi.detectSingleFace(image as any)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new FaceNotDetectedException();
        }

        let savedDescriptorArray: number[] = [];
        if (Array.isArray(employee.face_descriptor)) {
            savedDescriptorArray = employee.face_descriptor as number[];
        } else if (typeof employee.face_descriptor === 'object') {
            savedDescriptorArray = Object.values(employee.face_descriptor as any).map(Number);
        }

        const distance = faceapi.euclideanDistance(detection.descriptor, new Float32Array(savedDescriptorArray));

        if (distance > this.MATCH_THRESHOLD) {
            throw new FaceNotMatchedException();
        }

        // --- Step 3: Find Existing Timesheet ---
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Find open timesheet for today (check_in_at IS SET, check_out_at IS NULL)
        const timesheet = await this.prisma.timesheets.findFirst({
            where: {
                work_schedules: {
                    user_id: employeeId,
                },
                check_in_at: {
                    gte: new Date(todayStr + 'T00:00:00Z'),
                    lt: new Date(todayStr + 'T23:59:59Z')
                },
                check_out_at: null
            },
            include: {
                work_schedules: true
            }
        });

        if (!timesheet) {
            throw new BadRequestException('No active check-in found for today. Please check in first.');
        }

        // --- Step 4: Time Handling & Status Update ---
        let statusCode = timesheet.status_code; // Keep existing status (e.g., LATE) unless logic changes it
        let isFlagged = timesheet.is_flagged;

        const expectedEndStr = this.extractTimeStr(timesheet.work_schedules?.expected_end as any);

        if (expectedEndStr) {
            const [endH, endM] = expectedEndStr.split(':').map(Number);
            const expectedEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0);

            // Check Early Leave
            // Buffer: Maybe 5 mins tolerance? Assuming strict for now.
            if (now < expectedEndTime) {
                // Only update status to EARLY_LEAVE if it wasn't already LATE (or prioritize LATE?)
                // Usually LATE is for start, EARLY_LEAVE is for end. Can coexist? 
                // DB status_code is single string. Prioritize worst case or composite?
                // Requirement: "If ... set status_code to EARLY_LEAVE (if it's not already LATE)"
                if (statusCode !== 'LATE') {
                    statusCode = 'EARLY_LEAVE';
                }
                isFlagged = true;
                this.logger.warn(`Early Leave: ${employee.users.full_name} @ ${now.toLocaleTimeString()} (Exp: ${expectedEndStr})`);
            }
        }

        // --- Step 5: Calculate Hours ---
        const checkInTime = new Date(timesheet.check_in_at as Date);
        const durationMs = now.getTime() - checkInTime.getTime();
        const realWorkHours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2)); // Round to 2 decimals

        // --- Step 6: Update Timesheet ---
        const updatedTimesheet = await this.prisma.timesheets.update({
            where: { timesheet_id: timesheet.timesheet_id },
            data: {
                check_out_at: now,
                real_work_hours: realWorkHours,
                applied_hourly_rate: employee.base_salary, // Snapshot salary
                status_code: statusCode,
                is_flagged: isFlagged
            }
        });

        this.logger.log(`Check-out confirmed: ${employee.users.full_name}, Hours: ${realWorkHours}`);

        return {
            success: true,
            timesheetId: updatedTimesheet.timesheet_id,
            status: statusCode,
            realWorkHours,
            message: 'Check-out successful'
        };
    }
}
