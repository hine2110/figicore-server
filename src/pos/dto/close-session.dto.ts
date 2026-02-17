import { IsNotEmpty, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';

export class CloseSessionDto {
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    closing_cash: number;

    @IsOptional()
    @IsString()
    note?: string;
}
