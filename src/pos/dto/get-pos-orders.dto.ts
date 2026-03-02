import { IsOptional, IsString, IsInt, Min, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class GetPosOrdersDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 12;

    @IsOptional()
    @Transform(({ value }) => value === '' ? undefined : value)
    @IsDateString()
    date?: string; // Lọc 1 ngày duy nhất

    @IsOptional()
    @IsString()
    payment_method?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    sort_by?: string = 'created_at';

    @IsOptional()
    @IsString()
    sort_order?: 'asc' | 'desc' = 'desc';
}
