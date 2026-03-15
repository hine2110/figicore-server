import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class ReviewCorrectionDto {
    @IsString() @IsNotEmpty()
    @IsIn(['APPROVED', 'REJECTED'])
    status_code: string;

    @IsString() @IsOptional()
    manager_note?: string;

    // Nếu Approve, quản lý có thể truyền giờ mới và trạng thái mới vào đây
    @IsNumber() @IsOptional()
    adjusted_hours?: number;

    @IsString() @IsOptional()
    adjusted_status?: string;
}