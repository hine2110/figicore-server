import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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
}
