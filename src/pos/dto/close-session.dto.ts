import { IsNotEmpty, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';

export class CloseSessionDto {
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    closing_cash: number;

    @IsOptional()
    @IsNumber()
    expenses?: number;

    @IsOptional()
    @IsNumber()
    cash_revenue_app?: number;

    @IsOptional()
    cash_breakdown?: any;

    @IsOptional()
    @IsString()
    note?: string;
}
