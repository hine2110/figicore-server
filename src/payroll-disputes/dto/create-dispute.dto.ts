import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateDisputeDto {
    @IsInt()
    @IsNotEmpty()
    payroll_id: number;

    @IsString()
    @IsNotEmpty()
    content: string;
}