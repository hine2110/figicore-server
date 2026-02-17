import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class OpenSessionDto {
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    opening_cash: number;
}
