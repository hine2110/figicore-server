import { Controller, Post, Get, Body, UseGuards, Request, Query, Param, ParseIntPipe, Patch, Delete } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { UpdateBaseSalaryDto, UpdateSalaryConfigDto, RunPayrollDto, UpdatePayrollStatusDto, CreateSalaryConfigDto, AddAdjustmentDto } from './dto/update-salary.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpsertPenaltyRuleDto } from './dto/upsert-penalty-rule.dto';


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

    // ADMIN/MANAGER: Lấy danh sách toàn bộ phiếu lương của công ty
    @Get('all')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async getAllPayrolls(
        @Query('month') month?: string,
        @Query('year') year?: string,
        @Query('status') status?: string
    ) {
        return this.payrollService.getAllPayrolls(
            month ? parseInt(month) : undefined,
            year ? parseInt(year) : undefined,
            status
        );
    }

    // ADMIN/MANAGER: Đổi trạng thái phiếu lương
    @Patch(':id/status')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async updatePayrollStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePayrollStatusDto,
        @Request() req: any
    ) {
        const reviewerId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.updatePayrollStatus(id, dto.status_code, reviewerId);
    }

    @Delete(':payrollId/items/:itemId')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async deletePayrollItem(
        @Param('payrollId', ParseIntPipe) payrollId: number,
        @Param('itemId', ParseIntPipe) itemId: number
    ) {
        return this.payrollService.deletePayrollItem(payrollId, itemId);
    }

    // --- API QUẢN LÝ LUẬT PHẠT (CHỈ MANAGER/ADMIN) ---

    @Get('salary-configs/:userId')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async getSalaryConfigs(@Param('userId', ParseIntPipe) userId: number) {
        return this.payrollService.getEmployeeConfigs(userId);
    }

    @Post('salary-configs')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async createSalaryConfig(@Body() dto: CreateSalaryConfigDto) {
        return this.payrollService.createSalaryConfig(dto);
    }

    @Patch('salary-configs/:id/stop')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async stopSalaryConfig(@Param('id', ParseIntPipe) id: number) {
        return this.payrollService.stopSalaryConfig(id);
    }

    @Get('penalty-rules')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async getPenaltyRules() {
        return this.payrollService.getPenaltyRules();
    }

    @Post('penalty-rules')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async upsertPenaltyRule(@Body() dto: UpsertPenaltyRuleDto) {
        return this.payrollService.upsertPenaltyRule(dto);
    }

    @Get('salary-history/:userId')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async getEmployeeSalaryHistory(@Param('userId', ParseIntPipe) userId: number) {
        return this.payrollService.getEmployeeSalaryHistory(userId);
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

    @Patch('my-payrolls/:id/confirm')
    async confirmMyPayroll(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.payrollService.confirmMyPayroll(userId, id);
    }

    @Post(':id/adjust')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    async addPayrollAdjustment(@Param('id', ParseIntPipe) id: number, @Body() dto: AddAdjustmentDto) {
        return this.payrollService.addPayrollAdjustment(id, dto.title, dto.amount, dto.isAddition ?? true);
    }
}
