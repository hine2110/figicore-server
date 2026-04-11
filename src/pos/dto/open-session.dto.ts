import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class OpenSessionDto {
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    opening_cash: number;

    @IsOptional()
    @IsString()
    note?: string;
}
