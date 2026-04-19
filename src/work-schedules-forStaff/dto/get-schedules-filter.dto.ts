
import { IsOptional, IsString } from 'class-validator';

export class GetSchedulesFilterDto {
    @IsOptional()
    @IsString()
    from?: string;

    @IsOptional()
    @IsString()
    to?: string;

    @IsOptional()
    @IsString()
    include_pending?: string;
}
