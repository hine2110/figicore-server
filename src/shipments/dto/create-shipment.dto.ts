import { IsOptional, IsString } from 'class-validator';

export class CreateShipmentDto {
    @IsString()
    @IsOptional()
    note?: string;

    @IsString()
    @IsOptional()
    video_url?: string;
}
