import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsBoolean, IsDate } from 'class-validator';

export class CreateSalaryConfigDto {
    @IsInt() @IsNotEmpty() userId: number;
    @IsString() @IsNotEmpty() type_code: string; // ALLOWANCE hoặc DEDUCTION
    @IsString() @IsNotEmpty() name: string;
    @IsNumber() @IsNotEmpty() amount: number;
    @IsBoolean() @IsOptional() is_recurring?: boolean;
}

export class UpdateBaseSalaryDto {
    @IsInt()
    @IsNotEmpty()
    userId: number;

    @IsNumber()
    @IsNotEmpty()
    newSalary: number;

    @IsString()
    @IsNotEmpty()
    reasonCode: string;

    @IsString()
    @IsOptional()
    note?: string;
}

export class UpdateSalaryConfigDto {
    @IsInt()
    @IsNotEmpty()
    configId: number;

    @IsNumber()
    @IsNotEmpty()
    newAmount: number;
}

export class RunPayrollDto {
    @IsInt()
    @IsNotEmpty()
    userId: number;

    @IsInt()
    @IsNotEmpty()
    month: number;

    @IsInt()
    @IsNotEmpty()
    year: number;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    payment_start_date?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    payment_end_date?: Date;
}

export class UpdatePayrollStatusDto {
    @IsString()
    @IsNotEmpty()
    @IsIn(['DRAFT', 'SENT_FOR_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'DISPUTED'])
    status_code: string;
}

export class AddAdjustmentDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsNumber()
    @IsNotEmpty()
    amount: number;

    @IsOptional()
    isAddition?: boolean;
}

export class SetPaymentWindowDto {
    @IsNotEmpty()
    @Type(() => Date)
    @IsDate()
    payment_start_date: Date;

    @IsNotEmpty()
    @Type(() => Date)
    @IsDate()
    payment_end_date: Date;
}

export class SignPayrollDto {
    @IsString()
    @IsNotEmpty()
    signature_data: string; // Mã Base64 của hình vẽ chữ ký
}
