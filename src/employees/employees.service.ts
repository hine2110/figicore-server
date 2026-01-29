import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEmployeeDto: CreateEmployeeDto) {
    const { email, phone, full_name, role_code, job_title_code, base_salary, start_date } = createEmployeeDto;
    let { employee_code } = createEmployeeDto; // Allow manual override if provided

    // 1. Pre-check for duplicates
    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone already exists');
    }

    if (!employee_code) {
        employee_code = await this.generateEmployeeCode();
    } else {
        // Only check for duplicate if manual code is provided
        const existingEmployee = await this.prisma.employees.findFirst({
            where: { employee_code },
        });

        if (existingEmployee) {
            throw new ConflictException('Employee code already exists');
        }
    }

    // 2. Generate and hash password
    const defaultPassword = 'Figi@2026';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    // 3. Transaction
    return this.prisma.$transaction(async (tx) => {
      // Step A: Create User
      const newUser = await tx.users.create({
        data: {
          email,
          phone,
          full_name,
          role_code,
          password_hash: passwordHash,
          status_code: 'ACTIVE',
          is_verified: true,
        },
      });

      // Step B: Create Employee
      const newEmployee = await tx.employees.create({
        data: {
          user_id: newUser.user_id,
          employee_code: employee_code!, // Assured by generation logic
          job_title_code,
          base_salary,
          start_date: start_date || new Date(),
        },
      });

      // Return result (excluding password)
      const { password_hash, ...userResult } = newUser;
      return {
        ...userResult,
        employee_details: newEmployee,
      };
    });
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
