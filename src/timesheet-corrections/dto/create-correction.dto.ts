import { IsInt, IsNotEmpty, IsOptional, IsString, IsNumber, IsIn } from 'class-validator';

export class CreateCorrectionDto {
    @IsInt() @IsNotEmpty()
    timesheet_id: number;

    @IsString() @IsNotEmpty()
    reason: string;

    @IsString() @IsOptional()
    evidence_url?: string;
}