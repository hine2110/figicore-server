import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWorkScheduleDto {
    @IsInt()
    @IsNotEmpty()
    user_id: number;

    @IsDateString()
    @IsNotEmpty()
    date: string; // YYYY-MM-DD

    @IsString()
    @IsNotEmpty()
    shift_code: string;

    @IsDateString()
    @IsOptional()
    expected_start?: string; // ISO DateTime

    @IsDateString()
    @IsOptional()
    expected_end?: string; // ISO DateTime
}
