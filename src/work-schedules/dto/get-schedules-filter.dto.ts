import { IsDateString, IsOptional } from 'class-validator';

export class GetSchedulesFilterDto {
    @IsDateString()
    @IsOptional()
    from?: string; // YYYY-MM-DD

    @IsDateString()
    @IsOptional()
    to?: string; // YYYY-MM-DD
}
