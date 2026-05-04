import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
export class CreateAccessControlDto {
    @IsString()
    @IsNotEmpty()
    role_code: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/, {
        message: 'ip_address phải là IPv4 hợp lệ hoặc dải mạng CIDR (VD: 192.168.1.0/24)'
    })
    ip_address: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}