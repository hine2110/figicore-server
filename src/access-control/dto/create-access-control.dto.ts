import { IsBoolean, IsIP, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAccessControlDto {
    @IsString()
    @IsNotEmpty()
    role_code: string;

    @IsString()
    @IsIP()
    @IsNotEmpty()
    ip_address: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
