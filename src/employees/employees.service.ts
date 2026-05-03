import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ImportEmployeeDto } from './dto/import-employee.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService
  ) { }

  private decryptUser(user: any) {
    if (!user) return null;
    const decrypted = { ...user };
    if (decrypted.email) decrypted.email = this.encryption.decrypt(decrypted.email);
    if (decrypted.phone) decrypted.phone = this.encryption.decrypt(decrypted.phone);
    return decrypted;
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    const { email, phone, full_name, role_code, job_title_code, start_date } = createEmployeeDto;
    let { employee_code } = createEmployeeDto;

    const encryptedEmail = this.encryption.encryptDeterministic(email);
    const encryptedPhone = this.encryption.encryptDeterministic(phone);

    const existingUser = await this.prisma.users.findFirst({
      where: { OR: [{ email: encryptedEmail }, { phone: encryptedPhone }] },
    });

    if (existingUser) {
      if (existingUser.status_code === 'DELETED') {
        // Clear identifiers of the deleted user to allow the new creation
        await this.prisma.users.update({
          where: { user_id: existingUser.user_id },
          data: { email: null, phone: null }
        });
      } else {
        throw new ConflictException('User already exists');
      }
    }

    if (!employee_code) employee_code = await this.generateEmployeeCode();

    const defaultPassword = 'Figi@2026';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: { 
          email: encryptedEmail, 
          phone: encryptedPhone, 
          full_name, 
          role_code, 
          password_hash: passwordHash, 
          status_code: 'ACTIVE', 
          is_verified: true 
        },
      });
      const newEmployee = await tx.employees.create({
        data: { user_id: newUser.user_id, employee_code: employee_code!, job_title_code, start_date: start_date || new Date() },
      });
      return { ...this.decryptUser(newUser), employee_details: newEmployee };
    }, {
      timeout: 10000 // Tăng timeout cho create đơn lẻ
    });
  }

  async importEmployees(data: ImportEmployeeDto[]) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (const [index, row] of data.entries()) {
      try {
        const encryptedEmail = this.encryption.encryptDeterministic(row.email);
        const encryptedPhone = this.encryption.encryptDeterministic(row.phone);

        const existing = await this.prisma.users.findFirst({
          where: { OR: [{ email: encryptedEmail }, { phone: encryptedPhone }] }
        });

        if (existing) {
          // If the existing user is already DELETED, we anonymize it now to release the Email/Phone
          if (existing.status_code === 'DELETED') {
            await this.prisma.users.update({
              where: { user_id: existing.user_id },
              data: {
                email: null,
                phone: null,
                deleted_at: new Date()
              }
            });
            // After clearing, we can proceed to create a new user record
          } else {
            results.failed++;
            results.errors.push({ row: index + 1, message: `Email or Phone already exists` });
            continue;
          }
        }

        // 2. Generate Credentials
        const tempPassword = Math.random().toString(36).slice(-8); // Random 8 chars
        const salt = 10;
        const hash = await bcrypt.hash(tempPassword, salt);

        // 3. Transaction & Metadata
        let newUserResult: any = null;
        let activationToken: string = '';

        // Tăng timeout lên 30 giây cho mỗi lượt import để tránh đóng transaction sớm
        await this.prisma.$transaction(async (tx) => {
          // A. Create User
          const newUser = await tx.users.create({
            data: {
              full_name: row.full_name,
              email: encryptedEmail,
              phone: encryptedPhone,
              role_code: row.role_code,
              password_hash: hash,
              status_code: 'PENDING',
              is_verified: false,
              created_at: new Date(),
            }
          });

          // B. Generate Employee Code
          const employeeCode = `EMP${newUser.user_id.toString().padStart(6, '0')}`;

          // C. Create Employee
          await tx.employees.create({
            data: {
              user_id: newUser.user_id,
              employee_code: employeeCode,
              job_title_code: row.role_code,
              base_salary: 0,
              start_date: new Date(),
            }
          });

          newUserResult = newUser;
          activationToken = this.jwtService.sign(
            { sub: newUser.user_id, email: newUser.email },
            {
              secret: process.env.JWT_SECRET || 'figicore_secret_key',
              expiresIn: '24h'
            }
          );
        }, {
          timeout: 30000 // 30 seconds
        });

        // 4. Send Email (NGOÀI TRANSACTION)
        // Việc gửi email có thể tốn thời gian, tách ra để không làm nghẽn Database
        if (newUserResult) {
          try {
            // Không sử dụng await ở đây nếu bạn muốn chạy nền hoàn toàn, 
            // nhưng sử dụng await ở đây (ngoài transaction) vẫn an toàn hơn nhiều
            await this.mailService.sendEmployeeActivation(row.email, tempPassword, activationToken, row.full_name);
          } catch (emailErr) {
            console.error(`Failed to send email to ${row.email}`, emailErr);
            // Email lỗi không làm rollback DB, admin có thể dùng chức năng "Resend" sau
          }
          results.success++;
        }

      } catch (error) {
        console.error(error);
        results.failed++;
        results.errors.push({ row: index + 1, message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return results;
  }

  async findAll(page: number, limit: number, search?: string, role?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      const encryptedSearch = this.encryption.encryptDeterministic(search);
      where.OR = [
        { employee_code: { contains: search, mode: 'insensitive' } },
        { users: { full_name: { contains: search, mode: 'insensitive' } } },
        { users: { email: encryptedSearch } },
      ];
    }

    if (role && role !== 'ALL') {
      where.users = {
        ...where.users,
        role_code: role,
        status_code: { not: 'DELETED' }
      };
    } else {
      where.users = {
        ...where.users,
        role_code: {
          notIn: ['ADMIN', 'SUPER_ADMIN']
        },
        status_code: { not: 'DELETED' }
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.employees.findMany({
        where,
        include: {
          users: {
            select: {
              full_name: true,
              email: true,
              phone: true,
              status_code: true,
              avatar_url: true,
              role_code: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.employees.count({ where }),
    ]);

    const mappedData = data.map(emp => {
      return {
        ...emp,
        users: this.decryptUser(emp.users)
      };
    });

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, requestingUserId?: number, requestingRole?: string, ip?: string) {
    const employee = await this.prisma.employees.findUnique({
      where: { user_id: id },
      include: {
        users: {
          include: {
            addresses: true,
          },
        },
        work_schedules: {
          take: 5,
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!employee) return null;

    const decryptedUser = this.decryptUser(employee.users);

    // Audit Logging
    if (requestingUserId && requestingUserId !== id && requestingRole && requestingRole !== 'CUSTOMER') {
      await this.logPiiAccess(requestingUserId, id, ['phone', 'email', 'addresses'], ip);
    }

    const decryptedAddresses = employee.users.addresses.map(a => {
        const decA = { ...a };
        if (decA.detail_address) decA.detail_address = this.encryption.decrypt(decA.detail_address);
        if (decA.recipient_phone) decA.recipient_phone = this.encryption.decrypt(decA.recipient_phone);
        return decA;
    });

    return {
        ...employee,
        users: {
            ...decryptedUser,
            addresses: decryptedAddresses
        }
    };
  }

  private async generateEmployeeCode(): Promise<string> {
    const lastEmployee = await this.prisma.employees.findFirst({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!lastEmployee) {
      return 'EMP001';
    }

    const lastCode = lastEmployee.employee_code;
    const match = lastCode.match(/EMP(\d+)/);

    if (match && match[1]) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `EMP${nextNum.toString().padStart(3, '0')}`;
    }

    return `EMP${Date.now().toString().slice(-3)}`;
  }

  private async logPiiAccess(accessedBy: number, targetUserId: number, fieldsViewed: string[], ip?: string) {
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
      console.error('[PII Audit] Failed to write audit log:', e.message);
    }
  }

  async remove(id: number) {
    const employee = await this.prisma.employees.findUnique({
      where: { user_id: id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Dọn dẹp dữ liệu Hành chính/Lịch trình
        
        // Lấy danh sách ID lịch làm việc để xóa bảng công (timesheets) liên quan
        const schedules = await tx.work_schedules.findMany({
          where: { user_id: id },
          select: { schedule_id: true }
        });
        const scheduleIds = schedules.map(s => s.schedule_id);

        if (scheduleIds.length > 0) {
          // Xóa các bảng liên quan đến chấm công và điều chỉnh
          // Prisma deleteMany không hỗ trợ filter lồng nhau (nested), nên ta xóa trực tiếp theo user_id
          await tx.timesheet_corrections.deleteMany({
            where: { OR: [{ user_id: id }, { reviewer_id: id }] }
          });
          
          await tx.timesheets.deleteMany({
            where: { schedule_id: { in: scheduleIds } }
          });
        }

        // Xóa lịch làm việc
        await tx.work_schedules.deleteMany({ where: { user_id: id } });

        // Xóa đơn nghỉ phép
        await tx.leave_requests.deleteMany({ where: { user_id: id } });

        // Xóa các lịch sử thay đổi lương (Administrative)
        await tx.salary_change_histories.deleteMany({
          where: { OR: [{ user_id: id }, { changed_by_id: id }] }
        });

        // 2. Dọn dẹp dữ liệu Hệ thống của User
        await tx.notifications.deleteMany({ where: { user_id: id } });
        await tx.user_login_logs.deleteMany({ where: { user_id: id } });
        await tx.pii_access_logs.deleteMany({ 
          where: { OR: [{ accessed_by: id }, { target_user_id: id }] } 
        });
        await tx.profile_update_requests.deleteMany({ where: { user_id: id } });
        await tx.user_vouchers.deleteMany({ where: { user_id: id } });
        await tx.addresses.deleteMany({ where: { user_id: id } });
        
        // Xóa ví nếu có
        await tx.wallets.deleteMany({ where: { user_id: id } });

        // Xóa dữ liệu khuôn mặt (Face Descriptor) để có thể đăng ký lại
        await tx.system_lookups.deleteMany({
          where: {
            type: 'FACE_DESCRIPTOR',
            code: id.toString()
          }
        });

        // Xóa giỏ hàng (nếu có)
        const userCarts = await tx.carts.findMany({ where: { user_id: id } });
        const cartIds = userCarts.map(c => c.cart_id);
        if (cartIds.length > 0) {
          await tx.cart_items.deleteMany({ where: { cart_id: { in: cartIds } } });
          await tx.carts.deleteMany({ where: { user_id: id } });
        }

        // 3. Anonymize main records instead of hard deleting
        // This preserves foreign key integrity for Orders, Financials, etc.
        await tx.employees.update({
          where: { user_id: id },
          data: {
            deleted_at: new Date(),
            bank_account_no: null,
            bank_account_name: null,
            bank_qr_code_url: null
          }
        });

        await tx.users.update({
          where: { user_id: id },
          data: {
            full_name: 'Deleted Staff',
            email: null,
            phone: null,
            avatar_url: null,
            password_hash: null,
            status_code: 'DELETED',
            deleted_at: new Date(),
            is_verified: false,
            google_id: null
          }
        });

        return { message: 'Employee has been anonymized and administrative data cleaned' };
      });
    } catch (error: any) {
      // P2003 is less likely now since we are using update instead of delete, 
      // but we keep the try-catch for any other transaction failures.
      throw error;
    }
  }
}
