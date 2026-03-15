import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

export class CreateLeaveRequestDto {
    @IsString()
    @IsNotEmpty()
    type_code: string;

    @IsDateString()
    @IsNotEmpty()
    start_date: string;

    @IsDateString()
    @IsNotEmpty()
    end_date: string;

    @IsString()
    @IsOptional()
    reason?: string;

    @IsString()
    @IsOptional()
    evidence_url?: string;
}
