import { IsOptional, IsString } from 'class-validator';

export class SearchCustomerDto {
    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsString()
    q?: string; // General search query
}
