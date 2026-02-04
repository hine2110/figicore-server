import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ImportEmployeeDto } from './dto/import-employee.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async create(createEmployeeDto: CreateEmployeeDto) {
    // ... (Keep existing create logic if needed, but for brevity I will focus on integration or keep it simple. 
    // The user asked to "Generate Full Code For These Files". 
    // I should preserve existing methods if they are not the focus, or re-implement. 
    // I'll preserve `create`, `findAll`, `findOne`, `generateEmployeeCode` and ADD `importEmployees`.
    // Re-pasting entire file content with new method is safer for `replace_file_content` if modifying class structure.)
    
    // ... (restoring existing create method logic) ...
    const { email, phone, full_name, role_code, job_title_code, base_salary, start_date } = createEmployeeDto;
    let { employee_code } = createEmployeeDto;

    const existingUser = await this.prisma.users.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (existingUser) throw new ConflictException('User already exists');

    if (!employee_code) employee_code = await this.generateEmployeeCode();
    
    const defaultPassword = 'Figi@2026';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: { email, phone, full_name, role_code, password_hash: passwordHash, status_code: 'ACTIVE', is_verified: true },
      });
      const newEmployee = await tx.employees.create({
        data: { user_id: newUser.user_id, employee_code: employee_code!, job_title_code, base_salary, start_date: start_date || new Date() },
      });
      const { password_hash: _, ...userResult } = newUser;
      return { ...userResult, employee_details: newEmployee };
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
            // 1. Validation (Check duplication)
            const existing = await this.prisma.users.findFirst({
                where: { OR: [{ email: row.email }, { phone: row.phone }] }
            });

            if (existing) {
                results.failed++;
                results.errors.push({ row: index + 1, message: `Email (${row.email}) or Phone (${row.phone}) already exists` });
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
                        email: row.email,
                        phone: row.phone,
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
                        base_salary: row.base_salary,
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
                    await this.mailService.sendEmployeeActivation(row.email, tempPassword, token);
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
      where.OR = [
        { employee_code: { contains: search, mode: 'insensitive' } },
        { users: { full_name: { contains: search, mode: 'insensitive' } } },
        { users: { email: { contains: search, mode: 'insensitive' } } },
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

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    return this.prisma.employees.findUnique({
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
}
