import { Injectable, ConflictException } from '@nestjs/common';
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
    if (existingUser) throw new ConflictException('User already exists');

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
          results.failed++;
          results.errors.push({ row: index + 1, message: `Email or Phone already exists` });
          continue;
        }

        // 2. Generate Credentials
        const tempPassword = Math.random().toString(36).slice(-8); // Random 8 chars
        const salt = 10;
        const hash = await bcrypt.hash(tempPassword, salt);

        // 3. Transaction
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

          // B. Generate Employee Code (EMP + padded ID)
          const employeeCode = `EMP${newUser.user_id.toString().padStart(6, '0')}`; // e.g., EMP000012

          // C. Create Employee
          await tx.employees.create({
            data: {
              user_id: newUser.user_id,
              employee_code: employeeCode,
              job_title_code: row.role_code, // Using role as job title for now or "TBD"
              base_salary: 0,
              start_date: new Date(),
            }
          });

          // Address creation removed as per new requirement

          // 4. Send Email (Post-creation logic, but awaited to ensure delivery or log error)
          // Generate Activation Token
          const token = this.jwtService.sign(
            { sub: newUser.user_id, email: newUser.email },
            {
              secret: process.env.JWT_SECRET || 'figicore_secret_key',
              expiresIn: '24h'
            }
          );

          // Trigger Email
          try {
            await this.mailService.sendEmployeeActivation(row.email, tempPassword, token, row.full_name);
          } catch (emailErr) {
            console.error(`Failed to send email to ${row.email}`, emailErr);
            // We don't rollback transaction for email failure, but log it. Admin can resend.
          }
        });

        results.success++;

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

  /** Log a PII access event when staff views sensitive employee data */
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
}
