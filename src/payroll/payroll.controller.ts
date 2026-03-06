import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { UpdateBaseSalaryDto, UpdateSalaryConfigDto, RunPayrollDto } from './dto/update-salary.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('payroll')
@UseGuards(JwtAuthGuard)
export class PayrollController {
    constructor(private readonly payrollService: PayrollService) { }

    @Post('update-base-salary')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async updateBaseSalary(@Body() dto: UpdateBaseSalaryDto, @Request() req: any) {
        // Extract userId from token
        const changedById = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.updateBaseSalary(dto.userId, dto, changedById);
    }

    @Post('update-salary-config')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async updateSalaryConfig(@Body() dto: UpdateSalaryConfigDto) {
        return this.payrollService.updateSalaryConfig(dto.configId, dto);
    }

    @Post('run-payroll')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async runMonthlyPayroll(@Body() dto: RunPayrollDto, @Request() req: any) {
        const reviewerId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.runMonthlyPayroll(dto.userId, dto.month, dto.year, reviewerId);
    }

    // --- SELF SERVICE APIs ---

    @Get('my-history')
    async getMyHistory(@Request() req: any) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.getMySalaryHistory(userId);
    }

    @Get('my-payrolls')
    async getMyPayrolls(@Request() req: any) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.getMyPayrolls(userId);
    }
}
