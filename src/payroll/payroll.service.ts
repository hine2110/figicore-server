import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBaseSalaryDto, UpdateSalaryConfigDto } from './dto/update-salary.dto';
import dayjs from 'dayjs';
import { UpsertPenaltyRuleDto } from './dto/upsert-penalty-rule.dto';

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

        // 2. LOGIC MỚI: Phân tách ngày có hiệu lực
        let effectiveDate: Date;
        let isImmediate = false;

        if (dto.reasonCode === 'NEW_HIRE') {
            effectiveDate = new Date(); // Áp dụng ngay bây giờ!
            isImmediate = true;
        } else {
            // Các trường hợp khác (Tăng lương, thăng chức...) áp dụng vào đầu tháng sau
            effectiveDate = dayjs().add(1, 'month').startOf('month').toDate();
        }

        // 3. Open transaction
        return this.prisma.$transaction(async (tx) => {
            // A. Create new record in salary_change_histories
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

            // B. Nếu là nhân viên mới, cập nhật thẳng mức lương vào hồ sơ để UI hiển thị ngay lập tức
            if (isImmediate) {
                await tx.employees.update({
                    where: { user_id: userId },
                    data: { base_salary: dto.newSalary }
                });
            }

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

    async runMonthlyPayroll(userId: number, month: number, year: number, reviewerId: number, paymentStartDate?: Date, paymentEndDate?: Date) {
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

        // 3. Calculate Actual Work Hours (Fix: Query by work_schedules date, not check_in_at)
        const schedules = await this.prisma.work_schedules.findMany({
            where: {
                user_id: userId,
                date: { gte: startDate, lte: endDate },
                deleted_at: null, // Bỏ qua các ca đã bị xóa mềm (vd: ca bị xóa do nghỉ phép)
            },
            include: {
                timesheets: {
                    where: { deleted_at: null }
                }
            }
        });

        let actualWorkedHours = 0;
        for (const schedule of schedules) {
            if (schedule.timesheets && schedule.timesheets.length > 0) {
                actualWorkedHours += (schedule.timesheets[0].real_work_hours || 0);
            }
        }

        // 4. Calculate Paid Leave Hours (ANNUAL_PAID)
        const paidLeaves = await this.prisma.leave_requests.findMany({
            where: {
                user_id: userId,
                type_code: 'ANNUAL_PAID',
                status_code: 'APPROVED',
                // Chỉ lấy những đơn có thời gian chạm vào tháng này
                start_date: { lte: endDate },
                end_date: { gte: startDate }
            }
        });

        let paidLeaveDaysInMonth = 0;
        for (const leave of paidLeaves) {
            // Tìm khoảng thời gian giao nhau giữa đơn xin nghỉ và tháng hiện tại
            const overlapStart = leave.start_date < startDate ? startDate : leave.start_date;
            const overlapEnd = leave.end_date > endDate ? endDate : leave.end_date;

            if (overlapStart <= overlapEnd) {
                // Tính số ngày hợp lệ trong tháng
                const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                paidLeaveDaysInMonth += diffDays;
            }
        }

        const paidLeaveHours = paidLeaveDaysInMonth * 8; // 1 ngày phép = 8 tiếng
        const totalWorkHours = actualWorkedHours + paidLeaveHours;

        // 5. Get Effective Allowances & Deductions
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



        // =========================================================
        // BƯỚC MỚI: TÍNH TOÁN PHẠT CHUYÊN CẦN TỰ ĐỘNG
        // =========================================================

        // 1. Lấy tất cả các luật phạt từ hệ thống
        const penaltyRules = await this.prisma.system_lookups.findMany({
            where: { type: 'PENALTY_RULE' }
        });
        const lateRule = penaltyRules.find(r => r.code === 'LATE_PENALTY')?.meta_data as any;
        const earlyLeaveRule = penaltyRules.find(r => r.code === 'EARLY_LEAVE_PENALTY')?.meta_data as any; // ĐÃ ĐỔI THÀNH EARLY_LEAVE
        const correctionRule = penaltyRules.find(r => r.code === 'CORRECTION_PENALTY')?.meta_data as any;

        // 2. Đếm số lần vi phạm từ bảng chấm công
        let lateCount = 0;
        let earlyLeaveCount = 0; // ĐÃ ĐỔI TỪ missingCount
        for (const schedule of schedules) {
            if (schedule.timesheets && schedule.timesheets.length > 0) {
                const ts = schedule.timesheets[0];
                if (ts.status_code === 'LATE') lateCount++;
                if (ts.status_code === 'EARLY_LEAVE') earlyLeaveCount++; // ĐÃ ĐỔI
            }
        }

        // 3. Đếm số lần gửi khiếu nại trong tháng
        const correctionCount = await this.prisma.timesheet_corrections.count({
            where: {
                user_id: userId,
                created_at: { gte: startDate, lte: endDate }
            }
        });

        // 4. Tính toán số tiền phạt
        let totalPenalty = 0;
        const penaltyItems: { title: string; amount: number; is_addition: boolean }[] = [];

        // Tính phạt đi trễ
        if (lateCount > 0 && lateRule?.amount) {
            const latePenaltyAmount = lateCount * lateRule.amount;
            totalPenalty += latePenaltyAmount;
            penaltyItems.push({
                title: `Phạt đi trễ (${lateCount} lần)`,
                amount: latePenaltyAmount,
                is_addition: false
            });
        }

        // Tính phạt về sớm (MỚI)
        if (earlyLeaveCount > 0 && earlyLeaveRule?.amount) {
            const earlyLeavePenaltyAmount = earlyLeaveCount * earlyLeaveRule.amount;
            totalPenalty += earlyLeavePenaltyAmount;
            penaltyItems.push({
                title: `Phạt về sớm (${earlyLeaveCount} lần)`,
                amount: earlyLeavePenaltyAmount,
                is_addition: false
            });
        }

        // Tính phạt spam khiếu nại
        if (correctionRule?.amount) {
            const freeLimit = correctionRule.free_limit || 0;
            if (correctionCount > freeLimit) {
                const penalizedCorrections = correctionCount - freeLimit;
                const correctionPenaltyAmount = penalizedCorrections * correctionRule.amount;
                totalPenalty += correctionPenaltyAmount;
                penaltyItems.push({
                    title: `Phạt báo lỗi sai (Vượt mức ${freeLimit} lần, phạt ${penalizedCorrections} lần)`,
                    amount: correctionPenaltyAmount,
                    is_addition: false
                });
            }
        }

        // 6. Calculate Final Salary & Prepare Payroll Items
        const hourlyRate = effectiveBaseSalaryNum; // Đã sửa theo luật trả lương theo giờ của bạn

        const workedSalary = hourlyRate * actualWorkedHours;
        const leaveSalary = hourlyRate * paidLeaveHours;
        const proratedBase = workedSalary + leaveSalary;

        let sumAllowances = 0;
        let sumDeductions = 0;
        const payrollItemsData: { title: string; amount: number; is_addition: boolean }[] = [];

        payrollItemsData.push({
            title: `Lương cơ bản (Giờ làm thực tế: ${parseFloat(actualWorkedHours.toFixed(2))}h)`,
            amount: parseFloat(workedSalary.toFixed(2)),
            is_addition: true,
        });

        if (paidLeaveHours > 0) {
            payrollItemsData.push({
                title: `Lương phép năm (${paidLeaveDaysInMonth} ngày = ${paidLeaveHours}h)`,
                amount: parseFloat(leaveSalary.toFixed(2)),
                is_addition: true,
            });
        }

        // Add allowances and deductions (Từ bảng cấu hình lương cố định)
        for (const config of configs) {
            const isAddition = config.type_code !== 'DEDUCTION';
            const amount = config.amount.toNumber();

            // LOGIC CẤN TRỪ CHUYÊN CẦN (CHỈ TRỪ VÀO PHỤ CẤP NÀY, KHÔNG ĐỤNG VÀO LƯƠNG CƠ BẢN)
            if (isAddition && config.name.toLowerCase().includes('chuyên cần')) {

                // Tiền phạt tối đa chỉ được trừ bằng tiền chuyên cần
                const appliedPenalty = Math.min(amount, totalPenalty);

                sumAllowances += amount;         // Vẫn cộng đủ 100% tiền chuyên cần ban đầu
                sumDeductions += appliedPenalty; // Khấu trừ tiền phạt (tối đa bằng tiền chuyên cần)

                // Hiển thị dòng Phụ cấp gốc
                payrollItemsData.push({
                    title: config.name,
                    amount: amount,
                    is_addition: true,
                });

                // Hiển thị các dòng Phạt (nếu có)
                if (appliedPenalty > 0) {
                    if (totalPenalty > amount) {
                        // Nếu tổng phạt lố tiền chuyên cần, gộp lại thành 1 dòng để tránh sai số toán học hiển thị
                        payrollItemsData.push({
                            title: `Tổng phạt vi phạm (Đã giảm trừ để không lẹm vào lương cơ bản)`,
                            amount: appliedPenalty,
                            is_addition: false,
                        });
                    } else {
                        // Nếu phạt ít hơn chuyên cần, in chi tiết từng lỗi ra bình thường
                        payrollItemsData.push(...penaltyItems);
                    }
                }
            } else {
                // Các loại phụ cấp / khấu trừ khác thì cộng trừ bình thường
                if (isAddition) sumAllowances += amount;
                else sumDeductions += amount;

                payrollItemsData.push({
                    title: config.name,
                    amount: amount,
                    is_addition: isAddition,
                });
            }
        }

        const finalSalary = proratedBase + sumAllowances - sumDeductions;

        // 7. Save to Database using Transaction
        return this.prisma.$transaction(async (tx) => {
            const existingPayroll = await tx.payrolls.findFirst({
                where: { user_id: userId, month: month, year: year }
            });

            if (existingPayroll) {
                if (['PENDING_APPROVAL', 'APPROVED', 'PAID'].includes(existingPayroll.status_code || '')) {
                    throw new Error('Không thể tính lại phiếu lương đã chốt/thanh toán.');
                }

                // Xóa các chi tiết lương cũ của bản nháp này
                await tx.payroll_items.deleteMany({ where: { payroll_id: existingPayroll.payroll_id } });

                // Cập nhật lại bản ghi cũ bằng dữ liệu mới tính toán
                return tx.payrolls.update({
                    where: { payroll_id: existingPayroll.payroll_id },
                    data: {
                        total_work_hours: parseFloat(totalWorkHours.toFixed(2)),
                        final_salary: parseFloat(finalSalary.toFixed(2)),
                        status_code: 'DRAFT',
                        reviewer_id: reviewerId,
                        payroll_items: { create: payrollItemsData },
                    },
                    include: { payroll_items: true },
                });
            } else {
                return tx.payrolls.create({
                    data: {
                        user_id: userId, month: month, year: year,
                        total_work_hours: parseFloat(totalWorkHours.toFixed(2)),
                        final_salary: parseFloat(finalSalary.toFixed(2)),
                        status_code: 'DRAFT', reviewer_id: reviewerId,
                        payment_start_date: paymentStartDate,
                        payment_end_date: paymentEndDate,
                        payroll_items: { create: payrollItemsData },
                    },
                    include: { payroll_items: true },
                });
            }
        });
    }

    async updatePayrollStatus(payrollId: number, statusCode: string, reviewerId: number) {
        const payroll = await this.prisma.payrolls.findUnique({
            where: { payroll_id: payrollId }
        });

        if (!payroll) {
            throw new NotFoundException(`Không tìm thấy phiếu lương với ID ${payrollId}.`);
        }

        // Cập nhật trạng thái và người duyệt
        return this.prisma.payrolls.update({
            where: { payroll_id: payrollId },
            data: {
                status_code: statusCode,
                reviewer_id: reviewerId,
                updated_at: new Date()
            }
        });
    }

    // Thêm khoản điều chỉnh Nóng vào phiếu lương (Giải quyết khiếu nại)
    async addPayrollAdjustment(payrollId: number, title: string, amount: number, isAddition: boolean) {
        const payroll = await this.prisma.payrolls.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll) throw new NotFoundException('Không tìm thấy phiếu lương');

        return this.prisma.$transaction(async (tx) => {
            // 1. Tạo 1 dòng chi tiết lương mới (VD: + Bù tiền phạt sai)
            await tx.payroll_items.create({
                data: {
                    payroll_id: payrollId,
                    title: `[Điều chỉnh] ${title}`,
                    amount: amount,
                    is_addition: isAddition
                }
            });

            // 2. Tính lại tổng lương
            const newSalary = isAddition
                ? Number(payroll.final_salary) + Number(amount)
                : Number(payroll.final_salary) - Number(amount);

            // 3. Cập nhật phiếu lương và đưa trạng thái về DRAFT để Manager review lại
            return tx.payrolls.update({
                where: { payroll_id: payrollId },
                data: {
                    final_salary: Math.max(0, newSalary),
                    status_code: 'DRAFT',
                    updated_at: new Date()
                },
                include: {
                    payroll_items: true,
                    employees: { select: { users: { select: { full_name: true, email: true } } } },
                    payroll_disputes: { orderBy: { created_at: 'desc' }, take: 1 }
                }
            });
        });
    }

    // Xóa một khoản tiền cụ thể trong phiếu lương và tính lại Tổng tiền
    async deletePayrollItem(payrollId: number, itemId: number) {
        const payroll = await this.prisma.payrolls.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll) throw new NotFoundException('Không tìm thấy phiếu lương');

        return this.prisma.$transaction(async (tx) => {
            // 1. Kiểm tra khoản tiền có tồn tại không
            const item = await tx.payroll_items.findUnique({ where: { item_id: itemId } });
            if (!item || item.payroll_id !== payrollId) {
                throw new NotFoundException('Không tìm thấy khoản lương này');
            }

            // 2. Xóa khoản tiền
            await tx.payroll_items.delete({ where: { item_id: itemId } });

            // 3. Quét lại toàn bộ các khoản còn lại để tính lại Tổng Thực Lãnh
            const remainingItems = await tx.payroll_items.findMany({ where: { payroll_id: payrollId } });
            let newSalary = 0;
            for (const ri of remainingItems) {
                if (ri.is_addition) newSalary += Number(ri.amount);
                else newSalary -= Number(ri.amount);
            }

            // 4. Cập nhật lại phiếu lương (Lưu ý: Không cho phép lương < 0)
            return tx.payrolls.update({
                where: { payroll_id: payrollId },
                data: {
                    final_salary: Math.max(0, newSalary),
                    status_code: 'DRAFT', // Xóa xong thì trả về Nháp để sếp duyệt lại
                    updated_at: new Date()
                },
                include: {
                    payroll_items: true,
                    employees: { select: { users: { select: { full_name: true, email: true } } } },
                    payroll_disputes: { orderBy: { created_at: 'desc' }, take: 1 }
                }
            });
        });
    }

    // Tiện thể thêm luôn hàm lấy danh sách phiếu lương cho Admin/Manager xem
    async getAllPayrolls(month?: number, year?: number, status?: string) {
        const whereClause: any = {};
        if (month) whereClause.month = month;
        if (year) whereClause.year = year;
        if (status) whereClause.status_code = status;

        return this.prisma.payrolls.findMany({
            where: whereClause,
            include: {
                employees: {
                    select: { users: { select: { full_name: true, email: true } } }
                },
                payroll_items: true,
                payroll_disputes: {
                    orderBy: { created_at: 'desc' },
                    take: 1
                }
            },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
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
        const payrolls = await this.prisma.payrolls.findMany({
            where: { user_id: userId, status_code: { not: 'DRAFT' } },
            orderBy: [
                { year: 'desc' },
                { month: 'desc' }
            ],
            include: {
                payroll_items: true,
                payroll_disputes: true,
            }
        });

        const now = dayjs();

        // Map thêm cờ can_sign để Frontend hiển thị nút
        return payrolls.map(pr => {
            let canSign = false;

            // Điều kiện để được ký: Trạng thái là APPROVED và thời gian hiện tại nằm trong khoảng payment_window
            if (pr.status_code === 'APPROVED' && pr.payment_start_date && pr.payment_end_date) {
                const isAfterStart = now.isAfter(dayjs(pr.payment_start_date)) || now.isSame(dayjs(pr.payment_start_date), 'day');
                const isBeforeEnd = now.isBefore(dayjs(pr.payment_end_date)) || now.isSame(dayjs(pr.payment_end_date), 'day');

                if (isAfterStart && isBeforeEnd) {
                    canSign = true;
                }
            }

            return {
                ...pr,
                can_sign: canSign
            };
        });
    }

    // STAFF: Xác nhận phiếu lương của chính mình
    async confirmMyPayroll(userId: number, payrollId: number) {
        const payroll = await this.prisma.payrolls.findUnique({
            where: { payroll_id: payrollId }
        });

        if (!payroll || payroll.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền truy cập phiếu lương này.');
        }

        if (payroll.status_code !== 'SENT_FOR_REVIEW') {
            throw new BadRequestException('Phiếu lương này không ở trạng thái chờ xác nhận.');
        }

        return this.prisma.payrolls.update({
            where: { payroll_id: payrollId },
            data: {
                status_code: 'PENDING_APPROVAL', // Chuyển trạng thái sang chờ Sếp thanh toán
                updated_at: new Date()
            }
        });
    }

    // ADMIN/MANAGER: Lấy lịch sử thay đổi lương của một nhân viên bất kỳ
    async getEmployeeSalaryHistory(targetUserId: number) {
        return this.prisma.salary_change_histories.findMany({
            where: { user_id: targetUserId },
            orderBy: { created_at: 'desc' }, // Sắp xếp mới nhất lên đầu
            include: {
                users: { // Lấy thông tin người đã thực hiện thao tác đổi lương (changed_by_id)
                    select: { full_name: true, email: true }
                }
            }
        });
    }

    // =======================================================
    // --- SALARY CONFIGS (PHỤ CẤP / KHẤU TRỪ) ---
    // =======================================================

    // Lấy danh sách phụ cấp đang hoạt động của nhân viên
    async getEmployeeConfigs(userId: number) {
        return this.prisma.employee_salary_configs.findMany({
            where: {
                user_id: userId,
                OR: [
                    { effective_to: null },
                    { effective_to: { gte: new Date() } }
                ]
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // Thêm mới phụ cấp/khấu trừ
    async createSalaryConfig(dto: any) { // Dùng CreateSalaryConfigDto
        return this.prisma.employee_salary_configs.create({
            data: {
                user_id: dto.userId,
                type_code: dto.type_code,
                name: dto.name,
                amount: dto.amount,
                is_recurring: dto.is_recurring !== undefined ? dto.is_recurring : true,
                effective_from: new Date(), // Có hiệu lực ngay lập tức
            }
        });
    }

    // Hủy bỏ một khoản phụ cấp (Set effective_to = hiện tại)
    async stopSalaryConfig(configId: number) {
        return this.prisma.employee_salary_configs.update({
            where: { config_id: configId },
            data: { effective_to: new Date() }
        });
    }

    // --- PENALTY RULES MANAGEMENT ---

    // Lấy danh sách toàn bộ luật phạt
    async getPenaltyRules() {
        return this.prisma.system_lookups.findMany({
            where: { type: 'PENALTY_RULE' },
            orderBy: { sort_order: 'asc' }
        });
    }

    // Tạo mới hoặc Cập nhật luật phạt (Upsert)
    async upsertPenaltyRule(dto: UpsertPenaltyRuleDto) {
        const existing = await this.prisma.system_lookups.findFirst({
            where: { type: 'PENALTY_RULE', code: dto.code }
        });

        if (existing) {
            // Đã có luật này -> Cập nhật
            return this.prisma.system_lookups.update({
                where: { id: existing.id },
                data: {
                    value: dto.value,
                    // Prisma hỗ trợ lưu JSON thẳng vào trường meta_data
                    meta_data: dto.meta_data !== undefined ? dto.meta_data : existing.meta_data,
                    updated_at: new Date()
                }
            });
        } else {
            // Chưa có -> Tạo mới
            return this.prisma.system_lookups.create({
                data: {
                    type: 'PENALTY_RULE',
                    code: dto.code,
                    value: dto.value,
                    meta_data: dto.meta_data,
                    sort_order: 1 // Tùy chọn
                }
            });
        }
    }

    // MANAGER: Setup khoảng thời gian dự kiến trả lương
    async setPaymentWindow(payrollId: number, startDate: Date, endDate: Date) {
        const payroll = await this.prisma.payrolls.findUnique({ where: { payroll_id: payrollId } });
        if (!payroll) throw new NotFoundException('Không tìm thấy phiếu lương');

        if (payroll.status_code === 'PAID') {
            throw new BadRequestException('Phiếu lương này đã hoàn tất, không thể đổi ngày.');
        }

        return this.prisma.payrolls.update({
            where: { payroll_id: payrollId },
            data: {
                payment_start_date: startDate,
                payment_end_date: endDate,
                updated_at: new Date()
            }
        });
    }

    // STAFF: Ký xác nhận đã nhận lương
    async signMyPayroll(userId: number, payrollId: number, signatureData: string) {
        const payroll = await this.prisma.payrolls.findUnique({ where: { payroll_id: payrollId } });

        if (!payroll || payroll.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền thao tác trên phiếu lương này.');
        }

        if (payroll.status_code !== 'APPROVED') {
            throw new BadRequestException('Phiếu lương này chưa sẵn sàng để ký.');
        }

        const now = dayjs();
        if (!payroll.payment_start_date || !payroll.payment_end_date) {
            throw new BadRequestException('Manager chưa thiết lập thời gian trả lương.');
        }

        const isAfterStart = now.isAfter(dayjs(payroll.payment_start_date)) || now.isSame(dayjs(payroll.payment_start_date), 'day');
        const isBeforeEnd = now.isBefore(dayjs(payroll.payment_end_date)) || now.isSame(dayjs(payroll.payment_end_date), 'day');

        if (!isAfterStart || !isBeforeEnd) {
            throw new BadRequestException('Chưa tới hoặc đã quá hạn thời gian ký nhận lương.');
        }

        return this.prisma.payrolls.update({
            where: { payroll_id: payrollId },
            data: {
                signature_data: signatureData,
                signed_at: new Date(),
                status_code: 'PAID',
                updated_at: new Date()
            }
        });
    }
}
