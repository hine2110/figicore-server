import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBaseSalaryDto, UpdateSalaryConfigDto } from './dto/update-salary.dto';
import dayjs from 'dayjs';

@Injectable()
export class PayrollService {
    constructor(private readonly prisma: PrismaService) { }

    async updateBaseSalary(userId: number, dto: UpdateBaseSalaryDto, changedById: number) {
        // 1. Fetch current base salary
        const employee = await this.prisma.employees.findUnique({
            where: { user_id: userId },
            select: { base_salary: true },
        });

        if (!employee) {
            throw new NotFoundException(`Employee with ID ${userId} not found.`);
        }

        // 2. Calculate effective date: 1st day of next month at 00:00:00
        const effectiveDate = dayjs().add(1, 'month').startOf('month').toDate();

        // 3. Open transaction
        return this.prisma.$transaction(async (tx) => {
            // Create new record in salary_change_histories
            const newHistory = await tx.salary_change_histories.create({
                data: {
                    user_id: userId,
                    changed_by_id: changedById,
                    old_salary: employee.base_salary,
                    new_salary: dto.newSalary,
                    effective_date: effectiveDate,
                    reason: dto.reasonCode,
                    note: dto.note,
                },
            });

            return newHistory;
        });
    }

    async updateSalaryConfig(configId: number, dto: UpdateSalaryConfigDto) {
        // 1. Fetch existing config
        const currentConfig = await this.prisma.employee_salary_configs.findUnique({
            where: { config_id: configId },
        });

        if (!currentConfig) {
            throw new NotFoundException(`Salary config with ID ${configId} not found.`);
        }

        // 2. Calculate dates
        const endOfCurrentMonth = dayjs().endOf('month').toDate();
        const startOfNextMonth = dayjs().add(1, 'month').startOf('month').toDate();

        // 3. Open transaction
        return this.prisma.$transaction(async (tx) => {
            // Update old record: set effective_to = endOfCurrentMonth
            await tx.employee_salary_configs.update({
                where: { config_id: configId },
                data: { effective_to: endOfCurrentMonth },
            });

            // Create new record
            const newConfig = await tx.employee_salary_configs.create({
                data: {
                    user_id: currentConfig.user_id,
                    type_code: currentConfig.type_code,
                    name: currentConfig.name,
                    is_recurring: currentConfig.is_recurring,
                    amount: dto.newAmount,
                    effective_from: startOfNextMonth,
                    effective_to: null,
                },
            });

            return newConfig;
        });
    }

    async runMonthlyPayroll(userId: number, month: number, year: number, reviewerId: number) {
        // 1. Calculate Date Range (dayjs months are 0-indexed)
        const targetMonth = dayjs().year(year).month(month - 1);
        const startDate = targetMonth.startOf('month').toDate();
        const endDate = targetMonth.endOf('month').toDate();

        // 2. Determine Effective Base Salary
        const latestSalaryHistory = await this.prisma.salary_change_histories.findFirst({
            where: {
                user_id: userId,
                effective_date: { lte: endDate },
            },
            orderBy: { effective_date: 'desc' },
        });

        let effectiveBaseSalaryNum = 0;
        if (latestSalaryHistory) {
            effectiveBaseSalaryNum = latestSalaryHistory.new_salary.toNumber();
        } else {
            const employee = await this.prisma.employees.findUnique({
                where: { user_id: userId },
                select: { base_salary: true },
            });
            if (!employee) throw new NotFoundException(`Employee with ID ${userId} not found.`);
            effectiveBaseSalaryNum = employee.base_salary.toNumber();
        }

        // 3. Calculate Total Work Hours
        const timesheets = await this.prisma.timesheets.findMany({
            where: {
                work_schedules: { user_id: userId },
                check_in_at: { gte: startDate, lte: endDate },
            },
        });

        const totalWorkHours = timesheets.reduce((acc, curr) => acc + (curr.real_work_hours || 0), 0);

        // 4. Get Effective Allowances & Deductions
        const configs = await this.prisma.employee_salary_configs.findMany({
            where: {
                user_id: userId,
                effective_from: { lte: endDate },
                OR: [
                    { effective_to: null },
                    { effective_to: { gte: startDate } },
                ],
            },
        });

        // 5. Calculate Final Salary
        const STANDARD_HOURS = 160;
        const proratedBase = (effectiveBaseSalaryNum / STANDARD_HOURS) * totalWorkHours;

        let sumAllowances = 0;
        let sumDeductions = 0;
        const payrollItemsData: { title: string; amount: number; is_addition: boolean }[] = [];

        // Base salary item
        payrollItemsData.push({
            title: 'Lương cơ bản (Theo giờ công thực tế)',
            amount: proratedBase,
            is_addition: true,
        });

        for (const config of configs) {
            const isAddition = config.type_code !== 'DEDUCTION';
            const amount = config.amount.toNumber();

            if (isAddition) {
                sumAllowances += amount;
            } else {
                sumDeductions += amount;
            }

            payrollItemsData.push({
                title: config.name,
                amount: amount,
                is_addition: isAddition,
            });
        }

        const finalSalary = proratedBase + sumAllowances - sumDeductions;

        // 6. Save to Database using Transaction
        return this.prisma.$transaction(async (tx) => {
            const payroll = await tx.payrolls.create({
                data: {
                    user_id: userId,
                    month: month,
                    year: year,
                    total_work_hours: totalWorkHours,
                    final_salary: finalSalary,
                    status_code: 'DRAFT',
                    reviewer_id: reviewerId,
                    payroll_items: {
                        create: payrollItemsData,
                    },
                },
                include: {
                    payroll_items: true,
                },
            });

            return payroll;
        });
    }

    async getMySalaryHistory(userId: number) {
        return this.prisma.salary_change_histories.findMany({
            where: { user_id: userId },
            orderBy: { effective_date: 'desc' },
            include: {
                users: {
                    select: {
                        full_name: true,
                        role_code: true
                    }
                }
            }
        });
    }

    async getMyPayrolls(userId: number) {
        return this.prisma.payrolls.findMany({
            where: { user_id: userId },
            orderBy: [
                { year: 'desc' },
                { month: 'desc' }
            ],
            include: {
                payroll_items: true,
            }
        });
    }
}
