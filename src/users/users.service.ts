
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';

import { UploadService } from '../upload/upload.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(
      private prisma: PrismaService,
      private uploadService: UploadService,
      private jwtService: JwtService,
      private mailService: MailService
  ) { }

  async updateAvatar(userId: number, file: Express.Multer.File) {
      const user = await this.findOne(userId);
      if (!user) throw new NotFoundException('User not found');

      if (user.avatar_url) {
          throw new ForbiddenException("Bạn chỉ được phép cập nhật ảnh đại diện một lần duy nhất.");
      }

      const uploadResult = await this.uploadService.uploadFile(file, 'figicore_avatars');
      
      return this.prisma.users.update({
          where: { user_id: userId },
          data: { avatar_url: uploadResult.url }
      });
  }


  async create(data: any) {
    return this.prisma.users.create({
      data,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({
      where: { email },
      include: { customers: true },
    });
  }



  async findOne(id: number) {
    return this.prisma.users.findUnique({
      where: { user_id: id },
      include: { customers: true },
    });
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.email === 'admin@figicore.com' || user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot delete Super Admin');
    }

    return this.prisma.users.delete({
      where: { user_id: id },
    });
  }

  // Placeholder methods for controller compatibility if needed
  findAll() {
    return this.prisma.users.findMany();
  }

  async getProfile(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: {
        employees: true,
        customers: true,
        addresses: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pendingRequest = await this.prisma.profile_update_requests.findFirst({
        where: { user_id: userId, status_code: 'PENDING' }
    });

    // Flatten Response
    return {
      ...user,
      // Employee Fields
      employee_code: user.employees?.employee_code || null,
      job_title_code: user.employees?.job_title_code || null,
      base_salary: user.employees?.base_salary || null,
      start_date: user.employees?.start_date || null,
      // Customer Fields (Optional, but good for consistency)
      loyalty_points: user.customers?.loyalty_points || 0,
      current_rank_code: user.customers?.current_rank_code || 'UNRANKED',
      has_pending_request: !!pendingRequest,
    };
  }

  async updateProfile(userId: number, data: { full_name?: string; phone?: string }) {
    // Check phone uniqueness if phone is provided
    if (data.phone) {
      const existingUser = await this.prisma.users.findUnique({
        where: { phone: data.phone },
      });

      if (existingUser && existingUser.user_id !== userId) {
        throw new BadRequestException('Phone number is already taken');
      }
    }

    return this.prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: data.full_name,
        phone: data.phone,
      },
    });
  }

  update(id: number, data: any) {
    return this.prisma.users.update({
      where: { user_id: id },
      data,
    });
  }

  async updateStatus(id: number, status: string, reason?: string) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Safety Checks
    if (user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot change status of Super Admin');
    }

    // Prevent self-ban (Need to pass current user context ideally, but for now simple check)
    // NOTE: Controller should handle "Can't ban self" by checking Request user vs ID

    // If Banning, require reason (optional but good practice)
    if (status === 'BANNED' && !reason) {
        throw new BadRequestException('Reason is required when banning a user');
    }

    return this.prisma.users.update({
      where: { user_id: id },
      data: { 
          status_code: status,
          ban_reason: status === 'BANNED' ? reason : null // Clear reason if unbanning
      },
    });
  }
  async getPreviewEmail(role: string): Promise<{ email: string }> {
    const prefixMap: Record<string, string> = {
      'MANAGER': 'manager',
      'STAFF_POS': 'pos',
      'STAFF_INVENTORY': 'inventory',
      'SUPER_ADMIN': 'admin',
    };

    const prefix = prefixMap[role] || 'user';
    
    // Count existing users with this role to generate sequential number
    const count = await this.prisma.users.count({
      where: { role_code: role }
    });

    const nextNum = count + 1;
    return { email: `${prefix}${nextNum}@figicore.com` };
  }

  async getNextEmployeeId(role: string): Promise<{ code: string }> {
    const prefixMap: Record<string, string> = {
      'MANAGER': 'MGR',
      'STAFF_POS': 'POS',
      'STAFF_INVENTORY': 'INV',
    };

    const prefix = prefixMap[role] || 'EMP';

    const lastEmployee = await this.prisma.employees.findFirst({
      where: {
        employee_code: {
          startsWith: prefix
        }
      },
      orderBy: {
        created_at: 'desc',
      },
      select: { employee_code: true }
    });

    if (!lastEmployee || !lastEmployee.employee_code) {
      return { code: `${prefix}-001` };
    }

    // Regex to match PREFIX-XXX (where XXX are digits)
    const regex = new RegExp(`${prefix}-(\\d+)`);
    const match = lastEmployee.employee_code.match(regex);

    if (!match || !match[1]) {
        return { code: `${prefix}-001` };
    }

    const nextNum = parseInt(match[1], 10) + 1;
    const nextCode = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
    
    return { code: nextCode };
  }

  async createBulk(dto: { users: CreateEmployeeDto[] }) {
    return this.prisma.$transaction(async (tx) => {
      const createdEmployees: any[] = [];
      const nextNumberCache: Record<string, number> = {};

      for (const userDto of dto.users) {
          // 1. Determine Prefix
          let prefix = 'EMP';
          if (userDto.role_code === 'MANAGER') prefix = 'MGR';
          else if (userDto.role_code === 'STAFF_POS') prefix = 'POS';
          else if (userDto.role_code === 'STAFF_INVENTORY') prefix = 'INV';

          // 2. Calculate Next Number
          if (nextNumberCache[prefix] === undefined) {
              const allCodes = await tx.employees.findMany({
                  where: { employee_code: { startsWith: prefix } },
                  select: { employee_code: true }
              });
              const existingNumbers = allCodes
                  .map(e => {
                      const parts = e.employee_code.split('-');
                      return parts.length > 1 ? parseInt(parts[1], 10) : 0;
                  })
                  .filter(n => !isNaN(n))
                  .sort((a, b) => a - b);
              const maxNum = existingNumbers.length > 0 ? existingNumbers[existingNumbers.length - 1] : 0;
              nextNumberCache[prefix] = maxNum + 1;
          } else {
              nextNumberCache[prefix]++;
          }
          const currentNum = nextNumberCache[prefix];
          const employeeCode = `${prefix}-${String(currentNum).padStart(3, '0')}`;
          const email = `${prefix.toLowerCase()}${currentNum}@figicore.com`;

          // 3. Generate Auth Data
          const tempPassword = crypto.randomBytes(4).toString('hex');
          const passwordHash = await bcrypt.hash(tempPassword, 10);

          // 4. Create Records
          const newUser = await tx.users.create({
              data: {
                  full_name: userDto.full_name,
                  email: email,
                  password_hash: passwordHash, 
                  role_code: userDto.role_code,
                  phone: userDto.phone,
                  status_code: 'PENDING',
                  is_verified: false,
              }
          });

          const newEmployee = await tx.employees.create({
              data: {
                  user_id: newUser.user_id,
                  employee_code: employeeCode,
                  base_salary: Number(userDto.base_salary),
                  job_title_code: userDto.job_title_code || userDto.role_code,
                  start_date: userDto.start_date ? new Date(userDto.start_date) : new Date(),
              }
          });

          // 5. Send Activation Email
          const payload = { 
              sub: newUser.user_id, 
              email: newUser.email,
              role_code: newUser.role_code 
          };
          const token = this.jwtService.sign(payload);
          if (newUser.email) {
            await this.mailService.sendEmployeeActivation(newUser.email, tempPassword, token, newUser.full_name);
          }
          
          createdEmployees.push({ ...newUser, employee_details: newEmployee });
      }

      return createdEmployees;
    });
  }

  async createProfileUpdateRequest(userId: number, changes: any) {
    // Check for existing pending request
    const existing = await this.prisma.profile_update_requests.findFirst({
        where: { user_id: userId, status_code: 'PENDING' }
    });

    if (existing) {
        // Option A: Update existing request
        // return this.prisma.profile_update_requests.update({
        //     where: { request_id: existing.request_id },
        //     data: { changed_data: changes, updated_at: new Date() }
        // });
        // Option B: Throw error
        throw new BadRequestException('You verify have a pending profile update request.');
    }

    return this.prisma.profile_update_requests.create({
        data: {
            user_id: userId,
            changed_data: changes,
            status_code: 'PENDING'
        }
    });
  }

  async getPendingRequests() {
    return this.prisma.profile_update_requests.findMany({
      where: { status_code: 'PENDING' },
      include: {
        users: {
          select: {
            full_name: true,
            email: true,
            phone: true,
            avatar_url: true,
            role_code: true,
            employees: {
                select: { employee_code: true }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async resolveRequest(requestId: number, status: 'APPROVED' | 'REJECTED') {
    const request = await this.prisma.profile_update_requests.findUnique({
        where: { request_id: requestId },
        include: { users: true }
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.status_code !== 'PENDING') throw new BadRequestException('Request already resolved');

    return this.prisma.$transaction(async (tx) => {
        // 1. Update Request Status
        const updatedRequest = await tx.profile_update_requests.update({
            where: { request_id: requestId },
            data: { status_code: status, updated_at: new Date() }
        });

        // 2. If Approved, Update User Profile
        if (status === 'APPROVED') {
            const changedData = request.changed_data as Prisma.JsonObject;
            const updateData: any = {};
            if (changedData['full_name']) updateData.full_name = changedData['full_name'];
            if (changedData['phone']) updateData.phone = changedData['phone'];
            if (changedData['avatar_url']) updateData.avatar_url = changedData['avatar_url'];
            
            if (Object.keys(updateData).length > 0) {
                await tx.users.update({
                    where: { user_id: request.user_id },
                    data: updateData
                });
            }

            // Handle Address Update (separate table)
            // Check both potential keys (frontend might send 'address' or 'default_address')
            const newAddress = (changedData['address'] || changedData['default_address']) as string;
            
            if (newAddress) {
                // Find default address to update
                const defaultAddress = await tx.addresses.findFirst({
                    where: { user_id: request.user_id, is_default: true }
                });

                if (defaultAddress) {
                    await tx.addresses.update({
                        where: { address_id: defaultAddress.address_id },
                        data: { detail_address: newAddress }
                    });
                } else {
                    // Create new address with fallback values for required fields
                    await tx.addresses.create({
                        data: {
                            user_id: request.user_id,
                            // Prefer new/updated info, fallback to existing profile info
                            recipient_name: updateData.full_name || request.users.full_name,
                            recipient_phone: updateData.phone || request.users.phone || 'N/A', 
                            detail_address: newAddress,
                            // Dummy values to satisfy constraints
                            province_id: 0, 
                            district_id: 0,
                            ward_code: 'UNMAPPED',
                            is_default: true
                        }
                    });
                }
            }
        }

        return updatedRequest;
    });
  }

  async importUsersFromZip(file: Express.Multer.File) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
    };

    let zip: AdmZip;
    try {
      zip = new AdmZip(file.buffer);
    } catch (e) {
      throw new BadRequestException('Could not read ZIP file');
    }

    const zipEntries = zip.getEntries();
    
    // 1. Find Excel File
    const excelEntry = zipEntries.find(entry => 
      !entry.isDirectory && 
      !entry.entryName.includes('__MACOSX') && 
      (entry.entryName.endsWith('.xlsx') || entry.entryName.endsWith('.xls'))
    );

    if (!excelEntry) {
      throw new BadRequestException('ZIP must contain an Excel file (.xlsx or .xls)');
    }

    // 2. Parse Excel
    const workbook = XLSX.read(excelEntry.getData(), { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

    if (jsonData.length === 0) {
      throw new BadRequestException('Excel file is empty');
    }

    // 3. Process Rows
    for (const [index, row] of jsonData.entries()) {
      const rowNum = index + 1;
      try {
        const rawData = row as any;
        const fullName = rawData['Tên'] || rawData['Name'];
        const phone = rawData['Số điện thoại']?.toString() || rawData['Phone']?.toString();
        const email = rawData['Email'];
        const roleInput = rawData['Role'] || rawData['Chức vụ'];
        const salary = rawData['Lương'] || rawData['Salary'] || 0;
        const avatarFilename = rawData['avatar_filename'] || rawData['Avatar File'];

        if (!fullName || !phone || !email || !roleInput) {
          results.failed++;
          results.errors.push({ row: rowNum, message: 'Missing required fields (Name, Phone, Email, Role)' });
          continue;
        }

        // Map Role
        let roleCode = 'STAFF_POS';
        const roleStr = roleInput.toString().toLowerCase();
        if (roleStr.includes('quản lý') || roleStr.includes('manager')) roleCode = 'MANAGER';
        else if (roleStr.includes('kho') || roleStr.includes('warehouse') || roleStr.includes('kiểm kho')) roleCode = 'STAFF_INVENTORY';

        // Check Duplication
        const existing = await this.prisma.users.findFirst({
            where: { OR: [{ email: email.toString() }, { phone: phone.toString() }] }
        });

        if (existing) {
            results.failed++;
            results.errors.push({ row: rowNum, message: `Email (${email}) or Phone (${phone}) already exists` });
            continue;
        }

        // 4. Handle Avatar
        let avatarUrl: string | null = null;
        if (avatarFilename) {
          const targetName = avatarFilename.toString().toLowerCase().trim();
          const imageEntry = zipEntries.find(entry => {
             const entryName = entry.entryName.toLowerCase();
             // Check strict equality OR if it's inside a folder (ends with /filename)
             return entryName === targetName || entryName.endsWith('/' + targetName);
          });

          if (imageEntry) {
             try {
                const imageBuffer = imageEntry.getData();
                const mockFile: any = {
                    buffer: imageBuffer,
                    mimetype: 'image/jpeg', 
                    originalname: avatarFilename
                };
                
                const uploadRes = await this.uploadService.uploadFile(mockFile, 'figicore_avatars');
                avatarUrl = uploadRes.url;
             } catch (err) {
                console.error(`Failed to upload avatar for ${email}`, err);
                results.errors.push({ row: rowNum, message: `Warning: Avatar upload failed - ${err.message}` });
             }
          } else {
             results.errors.push({ row: rowNum, message: `Warning: Avatar file '${avatarFilename}' not found in ZIP` });
          }
        }

        // 5. Create User Transaction
        await this.createSingleEmployee({
            full_name: fullName,
            phone: phone.toString(),
            email: email.toString(),
            role_code: roleCode,
            base_salary: salary,
            avatar_url: avatarUrl
        });

        results.success++;

      } catch (error) {
         console.error(error);
         results.failed++;
         results.errors.push({ row: rowNum, message: error.message });
      }
    }

    return results;
  }

  private async createSingleEmployee(data: { full_name: string, phone: string, email: string, role_code: string, base_salary: number, avatar_url: string | null }) {
      // 1. Generate Temp Password (8 chars)
      const tempPassword = crypto.randomBytes(4).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      
      let prefix = 'EMP';
      if (data.role_code === 'MANAGER') prefix = 'MGR';
      if (data.role_code === 'STAFF_POS') prefix = 'POS';
      if (data.role_code === 'STAFF_INVENTORY') prefix = 'INV';

      const last = await this.prisma.employees.findFirst({
          where: { employee_code: { startsWith: prefix } },
          orderBy: { created_at: 'desc' },
          take: 1
      });
      
      let nextNum = 1;
      if (last?.employee_code) {
          const parts = last.employee_code.split('-');
          if (parts.length > 1) {
              const num = parseInt(parts[1], 10);
              if (!isNaN(num)) nextNum = num + 1;
          }
      }
      const employeeCode = `${prefix}-${String(nextNum).padStart(3, '0')}`;
      
      return this.prisma.$transaction(async (tx) => {
          // 2. Create User as PENDING
          const newUser = await tx.users.create({
              data: {
                  full_name: data.full_name,
                  email: data.email,
                  phone: data.phone,
                  password_hash: passwordHash,
                  role_code: data.role_code,
                  status_code: 'PENDING', // Start as PENDING
                  is_verified: false,
                  avatar_url: data.avatar_url
              }
          });

          await tx.employees.create({
              data: {
                  user_id: newUser.user_id,
                  employee_code: employeeCode,
                  base_salary: Number(data.base_salary),
                  job_title_code: data.role_code,
                  start_date: new Date()
              }
          });

          // 3. Generate Activation Token
          const payload = { 
              sub: newUser.user_id, 
              email: newUser.email,
              role_code: newUser.role_code 
          };
          const token = this.jwtService.sign(payload);

          // 4. Send Activation Email
          // Note: using this.mailService here. Since we are inside a transaction, if email fails, 
          // we might want to catch it to avoid rolling back the user creation? 
          // Ideally: Email failure shouldn't block creation, but for "Activation Flow", it's critical.
          // Let's allow it to fail the transaction so we don't have "orphan pending users".
          if (newUser.email) {
             await this.mailService.sendEmployeeActivation(newUser.email, tempPassword, token, newUser.full_name);
          }

          return newUser;
      });
  }
}
