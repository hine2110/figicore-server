import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertPenaltyRuleDto {
    @IsString()
    @IsNotEmpty()
    code: string; // VD: 'LATE_PENALTY', 'MISSING_PENALTY', 'CORRECTION_PENALTY'

    @IsString()
    @IsNotEmpty()
    value: string; // Tên hiển thị, VD: 'Phạt đi trễ', 'Phạt quên Check-out'

    // Dùng để chứa JSON cấu hình (VD: { "amount": 50000, "free_limit": 0 })
    @IsOptional()
    meta_data?: any;
}