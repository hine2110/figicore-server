import { IsDateString, IsNotEmpty } from 'class-validator';

export class CloneWorkScheduleDto {
    @IsDateString()
    @IsNotEmpty()
    source_date: string; // YYYY-MM-DD

    @IsDateString()
    @IsNotEmpty()
    target_date: string; // YYYY-MM-DD
}
