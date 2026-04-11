
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateEmployeeDto } from '../employees/dto/create-employee.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';

import { UploadService } from '../upload/upload.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { EncryptionService } from '../common/encryption.service';
import { GetAuditLogDto } from './dto/get-audit-log.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private jwtService: JwtService,
    private mailService: MailService,
    private encryption: EncryptionService,
    private notifications: NotificationsService,
  ) { }

  /** Log a PII access event when staff views sensitive customer data */
  async logPiiAccess(accessedBy: number, targetUserId: number, fieldsViewed: string[], ip?: string) {
    try {
      await this.prisma.pii_access_logs.create({
        data: {
          accessed_by: accessedBy,
          target_user_id: targetUserId,
          fields_viewed: fieldsViewed.join(','),
          ip_address: ip || null,
        }
      });
    } catch (e) {
      // Non-blocking: log failure should NOT break the main request
      console.error('[PII Audit] Failed to write audit log:', e.message);
    }
  }

  /** Decrypt a user record's PII fields (phone, email) */
  /** Decrypt a user record's PII fields (phone, email) - Internal Use */
  private decryptUser(user: any): any {
    if (!user) return user;
    return {
      ...user,
      phone: user.phone ? this.encryption.decrypt(user.phone) : user.phone,
      email: user.email ? this.encryption.decrypt(user.email) : user.email,
    };
  }

  /** Remove sensitive internal fields before returning to client */
  private sanitizeUser(user: any): any {
    if (!user) return user;
    const { password_hash, otp_code, otp_expires_at, google_id, refresh_token, ...safeUser } = user;
    return safeUser;
  }

  /** Decrypt an address's PII fields */
  private decryptAddress(address: any): any {
    if (!address) return address;
    return {
      ...address,
      detail_address: address.detail_address ? this.encryption.decrypt(address.detail_address) : address.detail_address,
      recipient_phone: address.recipient_phone ? this.encryption.decrypt(address.recipient_phone) : address.recipient_phone,
    };
  }

  async updateAvatar(userId: number, file: Express.Multer.File) {
    const user = await this.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    // Removed 1-time upload limit to support continuous continuous uploads via frontend
    const uploadResult = await this.uploadService.uploadFile(file, 'figicore_avatars');

    return this.prisma.users.update({
      where: { user_id: userId },
      data: { avatar_url: uploadResult.url }
    });
  }

  async updateBankInfo(userId: number, data: any) {
    // 1. Kiểm tra xem user này có hồ sơ nhân viên (Employee) không
    const employee = await this.prisma.employees.findUnique({
      where: { user_id: userId }
    });

    if (!employee) {
      throw new ForbiddenException('Only employees can update bank information.');
    }

    // 2. Cập nhật thẳng vào bảng employees (Không cần thông qua bảng requests)
    return this.prisma.employees.update({
      where: { user_id: userId },
      data: {
        bank_name: data.bank_name,
        bank_account_no: data.bank_account_no,
        bank_account_name: data.bank_account_name,
        bank_qr_code_url: data.bank_qr_code_url,
        updated_at: new Date()
      }
    });
  }


  async create(data: any) {
    // Encrypt PII fields before storing
    const safeData = { ...data };
    if (safeData.email) safeData.email = this.encryption.encryptDeterministic(safeData.email);
    if (safeData.phone) safeData.phone = this.encryption.encryptDeterministic(safeData.phone);

    // Auto-create Customer profile and Wallet if role is CUSTOMER
    const isCustomer = safeData.role_code === 'CUSTOMER';

    return this.prisma.users.create({
      data: {
        ...safeData,
        customers: isCustomer ? {
          create: {
            current_rank_code: 'BRONZE',
            loyalty_points: 0,
            total_spent: 0
          }
        } : undefined,
        wallets: isCustomer ? {
          create: {
            balance_available: 0,
            balance_locked: 0
          }
        } : undefined
      },
      include: {
        customers: true,
        wallets: true
      }
    });
  }

  async findAll() {
    const users = await this.prisma.users.findMany();
    return users.map(user => this.sanitizeUser(this.decryptUser(user)));
  }

  async findByEmail(email: string) {
    if (!email) return null;
    const encryptedEmail = this.encryption.encryptDeterministic(email);

    // 1. Try search with encrypted email
    let user = await this.prisma.users.findUnique({
      where: { email: encryptedEmail },
      include: { customers: true },
    });

    // 2. Fallback: Try search with plaintext email (for legacy records)
    if (!user) {
      user = await this.prisma.users.findUnique({
        where: { email },
        include: { customers: true },
      });
    }

    return this.decryptUser(user);
  }

  async findByPhone(phone: string) {
    if (!phone) return null;
    const encryptedPhone = this.encryption.encryptDeterministic(phone);

    // 1. Try search with encrypted phone
    let user = await this.prisma.users.findUnique({
      where: { phone: encryptedPhone },
      include: { customers: true },
    });

    // 2. Fallback: Try search with plaintext phone
    if (!user) {
      user = await this.prisma.users.findUnique({
        where: { phone },
        include: { customers: true },
      });
    }

    return this.decryptUser(user);
  }



  async findOne(id: number, sanitize = true) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: id },
      include: { customers: true },
    });
    
    if (!user) return null;
    
    const decrypted = this.decryptUser(user);
    return sanitize ? this.sanitizeUser(decrypted) : decrypted;
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

  async getProfile(userId: number, requestingUserId?: number, requestingRole?: string, ip?: string) {
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

    // Decrypt PII fields
    const decryptedUser = this.decryptUser(user);
    const decryptedAddresses = (user.addresses || []).map(a => this.decryptAddress(a));

    // Log PII access if staff is viewing someone else's profile
    if (requestingUserId && requestingUserId !== userId && requestingRole && requestingRole !== 'CUSTOMER') {
      await this.logPiiAccess(requestingUserId, userId, ['phone', 'email', 'address'], ip);
    }

    // Flatten Response
    return this.sanitizeUser({
      ...decryptedUser,
      addresses: decryptedAddresses,
      // Employee Fields
      employee_code: user.employees?.employee_code || null,
      job_title_code: user.employees?.job_title_code || null,
      base_salary: user.employees?.base_salary || null,
      start_date: user.employees?.start_date || null,

      bank_name: user.employees?.bank_name || null,
      bank_account_no: user.employees?.bank_account_no || null,
      bank_account_name: user.employees?.bank_account_name || null,
      bank_qr_code_url: user.employees?.bank_qr_code_url || null,

      // Customer Fields (Optional, but good for consistency)
      loyalty_points: user.customers?.loyalty_points || 0,
      current_rank_code: user.customers?.current_rank_code || 'UNRANKED',
      has_pending_request: !!pendingRequest,
    });
  }

  async updateProfile(userId: number, data: UpdateProfileDto) {
    // 1. SECURITY: Prevent direct update of sensitive fields (Phone/Email) for everyone through this endpoint.
    // These should go through createProfileUpdateRequest which requires OTP.
    if (data.phone || data.email) {
      throw new BadRequestException('Security: Phone and Email updates require OTP verification. Please use the "Request Update" feature.');
    }

    // 2. DOB Locking Logic
    const currentUser = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { dob: true }
    });

    if (currentUser?.dob && data.dob && new Date(currentUser.dob).toISOString().split('T')[0] !== new Date(data.dob).toISOString().split('T')[0]) {
      throw new BadRequestException('Date of Birth cannot be changed once set.');
    }

    const updateData: any = {};
    if (data.full_name) updateData.full_name = data.full_name;
    if (data.dob) updateData.dob = new Date(data.dob);

    const updated = await this.prisma.users.update({
      where: { user_id: userId },
      data: updateData,
    });
    return this.sanitizeUser(this.decryptUser(updated));
  }

  async update(id: number, data: any) {
    // Encrypt PII fields if provided in update data
    const safeData = { ...data };
    if (safeData.email) safeData.email = this.encryption.encryptDeterministic(safeData.email);
    if (safeData.phone) safeData.phone = this.encryption.encryptDeterministic(safeData.phone);
    const updated = await this.prisma.users.update({
      where: { user_id: id },
      data: safeData,
    });
    return this.sanitizeUser(this.decryptUser(updated));
  }

  async updateStatus(id: number, status: string, reason?: string) {
    const user = await this.findOne(id, false);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Safety Checks
    if (user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot change status of Super Admin');
    }

    // Determine target status
    let finalStatus = status;
    if (status === 'ACTIVE' && !user.is_verified) {
      // If unbanning/activating a user who hasn't completed activation flow
      finalStatus = user.role_code === 'CUSTOMER' ? 'INACTIVE' : 'PENDING';
    }

    // If Banning, require reason
    if (finalStatus === 'BANNED' && !reason) {
      throw new BadRequestException('Reason is required when banning a user');
    }

    return this.prisma.users.update({
      where: { user_id: id },
      data: {
        status_code: finalStatus,
        ban_reason: finalStatus === 'BANNED' ? reason : null // Clear reason if unbanning
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

        // 4. Create Records (Encrypt PII before storing)
        const newUser = await tx.users.create({
          data: {
            full_name: userDto.full_name,
            email: this.encryption.encryptDeterministic(email),
            password_hash: passwordHash,
            role_code: userDto.role_code,
            phone: userDto.phone ? this.encryption.encryptDeterministic(userDto.phone) : null,
            status_code: 'PENDING',
            is_verified: false,
          }
        });

        const newEmployee = await tx.employees.create({
          data: {
            user_id: newUser.user_id,
            employee_code: employeeCode,
            job_title_code: userDto.job_title_code || userDto.role_code,
            start_date: userDto.start_date ? new Date(userDto.start_date) : new Date(),
          }
        });

        // 5. Send Activation Email (use plaintext email, NOT encrypted)
        const payload = {
          sub: newUser.user_id,
          email: email, // plaintext for JWT
          role_code: newUser.role_code
        };
        const token = this.jwtService.sign(payload, { expiresIn: '1d' });
        if (email) {
          await this.mailService.sendEmployeeActivation(email, tempPassword, token, newUser.full_name);
        }

        createdEmployees.push(this.sanitizeUser({ ...newUser, employee_details: newEmployee }));
      }

      return createdEmployees;
    });
  }

  async sendUpdateOtp(userId: number) {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user || !user.email) {
      throw new BadRequestException('Email not found for this user.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);

    await this.prisma.users.update({
      where: { user_id: userId },
      data: {
        otp_code: otp,
        otp_expires_at: expiry,
      },
    });

    const decryptedEmail = this.encryption.decrypt(user.email);
    await this.mailService.sendOtpEmail(decryptedEmail, otp);
    return { success: true, message: 'OTP sent to your email.' };
  }

  async createProfileUpdateRequest(userId: number, changes: any, otp: string) {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // 1. Verify OTP only if sensitive fields (PII) are being changed (Customers only)
    const isSensitiveUpdate = changes.phone || changes.email;
    
    if (isSensitiveUpdate && user.role_code === 'CUSTOMER') {
      if (user.otp_code !== otp || !user.otp_expires_at || new Date() > user.otp_expires_at) {
        throw new BadRequestException('Invalid or expired OTP for sensitive information update.');
      }

      // Clear OTP after use
      await this.prisma.users.update({
        where: { user_id: userId },
        data: { otp_code: null, otp_expires_at: null }
      });
    }

    // 2. Check for duplicates before creating request (PII fields)
    if (changes.email || changes.phone) {
      const encryptedEmail = changes.email ? this.encryption.encryptDeterministic(changes.email) : undefined;
      const encryptedPhone = changes.phone ? this.encryption.encryptDeterministic(changes.phone) : undefined;

      const duplicate = await this.prisma.users.findFirst({
        where: {
          user_id: { not: userId },
          OR: [
            encryptedEmail ? { email: encryptedEmail } : undefined,
            encryptedPhone ? { phone: encryptedPhone } : undefined
          ].filter(Boolean) as Prisma.usersWhereInput[]
        }
      });

      if (duplicate) {
        const field = (encryptedEmail && duplicate.email === encryptedEmail) ? 'Email' : 'Phone number';
        throw new BadRequestException(`This ${field.toLowerCase()} is already used by another account.`);
      }
    }

    // 3. Role-based Logic
    if (user.role_code === 'CUSTOMER') {
      // Auto-update for customers
      const updateData: any = {};
      if (changes.full_name) updateData.full_name = changes.full_name;
      if (changes.phone) updateData.phone = this.encryption.encryptDeterministic(changes.phone);
      if (changes.email) updateData.email = this.encryption.encryptDeterministic(changes.email);

      await this.prisma.users.update({
        where: { user_id: userId },
        data: updateData,
      });

      return { success: true, message: 'Profile updated successfully.' };
    }

    // 3. For Staff: Create request for Admin approval
    const existing = await this.prisma.profile_update_requests.findFirst({
      where: { user_id: userId, status_code: 'PENDING' }
    });

    if (existing) {
      throw new BadRequestException('You verify have a pending profile update request.');
    }

    const request = await this.prisma.profile_update_requests.create({
      data: {
        user_id: userId,
        changed_data: changes,
        status_code: 'PENDING'
      }
    });

    // 4. Notify Admins/Managers about the new request
    const admins = await this.prisma.users.findMany({
      where: {
        role_code: { in: ['SUPER_ADMIN'] },
        status_code: 'ACTIVE'
      },
      select: { user_id: true }
    });

    for (const admin of admins) {
      await this.notifications.create(
        admin.user_id,
        'Personal Information Update Request',
        `Employee ${user.full_name} has submitted a request to change personal information. Please review.`,
        '/admin/approvals',
        true
      );
    }

    return request;
  }

  async getPendingRequests() {
    const requests = await this.prisma.profile_update_requests.findMany({
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

    return requests.map(req => {
      // 1. Decrypt existing user info
      const decryptedUser = this.decryptUser(req.users);
      
      // 2. Decrypt changed_data (candidate PII for update)
      const changedData = req.changed_data as any;
      if (changedData?.email) {
        changedData.email = this.encryption.isEncrypted(changedData.email) 
          ? this.encryption.decrypt(changedData.email) 
          : changedData.email;
      }
      if (changedData?.phone) {
        changedData.phone = this.encryption.isEncrypted(changedData.phone)
          ? this.encryption.decrypt(changedData.phone)
          : changedData.phone;
      }
      if (changedData?.address) {
        changedData.address = this.encryption.isEncrypted(changedData.address)
          ? this.encryption.decrypt(changedData.address)
          : changedData.address;
      }

      return {
        ...req,
        users: this.sanitizeUser(decryptedUser),
        changed_data: changedData
      };
    });
  }

  async resolveRequest(requestId: number, status: 'APPROVED' | 'REJECTED') {
    const request = await this.prisma.profile_update_requests.findUnique({
      where: { request_id: requestId },
      include: { users: true }
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.status_code !== 'PENDING') throw new BadRequestException('Request already resolved');

    const result = await this.prisma.$transaction(async (tx) => {
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
        if (changedData['phone']) updateData.phone = this.encryption.encryptDeterministic(changedData['phone'] as string);
        if (changedData['email']) updateData.email = this.encryption.encryptDeterministic(changedData['email'] as string);
        if (changedData['avatar_url']) updateData.avatar_url = changedData['avatar_url'];
        if (changedData['dob']) updateData.dob = new Date(changedData['dob'] as string);

        if (Object.keys(updateData).length > 0) {
          // Double check for duplicates before applying (to be safe)
          if (updateData.email || updateData.phone) {
             const duplicate = await tx.users.findFirst({
               where: {
                 user_id: { not: request.user_id },
                 OR: [
                   updateData.email ? { email: updateData.email } : undefined,
                   updateData.phone ? { phone: updateData.phone } : undefined
                 ].filter(Boolean) as Prisma.usersWhereInput[]
               }
             });

             if (duplicate) {
               const field = (updateData.email && duplicate.email === updateData.email) ? 'Email' : 'Phone number';
               throw new BadRequestException(`This ${field.toLowerCase()} is already used by another account.`);
             }
          }

          await tx.users.update({
            where: { user_id: request.user_id },
            data: updateData
          });
        }

        // Handle Address Update (separate table)
        const newAddress = (changedData['address'] || changedData['default_address']) as string;

        if (newAddress) {
          const defaultAddress = await tx.addresses.findFirst({
            where: { user_id: request.user_id, is_default: true }
          });

          if (defaultAddress) {
            await tx.addresses.update({
              where: { address_id: defaultAddress.address_id },
              data: { detail_address: this.encryption.encrypt(newAddress) }
            });
          } else {
            await tx.addresses.create({
              data: {
                user_id: request.user_id,
                recipient_name: updateData.full_name || request.users.full_name,
                recipient_phone: this.encryption.encrypt(updateData.phone || request.users.phone || 'N/A'),
                detail_address: this.encryption.encrypt(newAddress),
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

    // 3. Notify Employee about resolution (Moved OUTSIDE transaction to avoid P2028 timeout)
    try {
      const statusText = status === 'APPROVED' ? 'Approved' : 'Rejected';
      const roleLinks: Record<string, string> = {
        'SUPER_ADMIN': '/admin/profile',
        'MANAGER': '/manager/profile',
        'STAFF_INVENTORY': '/warehouse/profile',
        'STAFF_POS': '/pos/profile',
        'CUSTOMER': '/customer/profile'
      };
      
      const targetUrl = roleLinks[request.users.role_code] || '/manager/profile';

      await this.notifications.create(
        request.user_id,
        'Profile Update Request Status',
        `Your request to change personal information has been ${statusText.toLowerCase()}.`,
        targetUrl,
        true
      );
    } catch (err) {
      console.error('[Notification Error] Failed to notify user after request resolution:', err.message);
    }

    return result;
  }

  async getPiiAccessLogs(query: GetAuditLogDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.accessor_id) where.accessed_by = Number(query.accessor_id);
    if (query.target_id) where.target_user_id = Number(query.target_id);

    const [logs, total] = await Promise.all([
      this.prisma.pii_access_logs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { accessed_at: 'desc' },
        include: {
          accessor: {
            select: {
              user_id: true,
              full_name: true,
              email: true,
              role_code: true
            }
          },
          target: {
            select: {
              user_id: true,
              full_name: true,
              email: true,
              phone: true
            }
          }
        }
      }),
      this.prisma.pii_access_logs.count({ where })
    ]);

    // Decrypt fields in logs
    const items = logs.map(log => ({
      ...log,
      accessor: this.sanitizeUser(this.decryptUser(log.accessor)),
      target: this.sanitizeUser(this.decryptUser(log.target))
    }));

    return {
      success: true,
      items, // Add items to match common.types.ts
      data: items, // Keep data for backward compatibility or existing logic
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
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

        // Map Role — strict match, no silent default
        let roleCode: string | null = null;
        const roleStr = roleInput.toString().toLowerCase().trim();
        if (roleStr.includes('quản lý') || roleStr.includes('manager')) {
          roleCode = 'MANAGER';
        } else if (roleStr.includes('kho') || roleStr.includes('warehouse') || roleStr.includes('kiểm kho')) {
          roleCode = 'STAFF_INVENTORY';
        } else if (roleStr.includes('pos') || roleStr.includes('thu ngân') || roleStr.includes('bán hàng') || roleStr.includes('cashier')) {
          roleCode = 'STAFF_POS';
        }

        if (!roleCode) {
          results.failed++;
          results.errors.push({ row: rowNum, message: `Invalid or unrecognized role: "${roleInput}". Accepted values: Quản lý / Manager, Kho / Warehouse, POS / Thu ngân / Cashier` });
          continue;
        }

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
              console.error(`Failed to upload avatar for a user during import`, err.message);
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
        console.error(`[Import] Error processing row ${rowNum}:`, error.message);
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
      // 2. Create User as PENDING (Encrypt PII before storing)
      const newUser = await tx.users.create({
        data: {
          full_name: data.full_name,
          email: this.encryption.encryptDeterministic(data.email),
          phone: data.phone ? this.encryption.encryptDeterministic(data.phone) : null,
          password_hash: passwordHash,
          role_code: data.role_code,
          status_code: 'PENDING',
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
      const token = this.jwtService.sign(payload, { expiresIn: '1d' });

      // 4. Send Activation Email
      // Note: using this.mailService here. Since we are inside a transaction, if email fails, 
      // we might want to catch it to avoid rolling back the user creation? 
      // Ideally: Email failure shouldn't block creation, but for "Activation Flow", it's critical.
      // Let's allow it to fail the transaction so we don't have "orphan pending users".
      // 4. Send Activation Email (use plaintext email, NOT encrypted)
      if (data.email) {
        await this.mailService.sendEmployeeActivation(data.email, tempPassword, token, newUser.full_name);
      }

      return newUser;
    });
  }
}
