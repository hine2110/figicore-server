
import { IsOptional, IsString } from 'class-validator';

export class GetSchedulesFilterDto {
    @IsOptional()
    @IsString()
    from?: string;

    @IsOptional()
    @IsString()
    to?: string;
}
