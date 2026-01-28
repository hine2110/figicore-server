import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';

export class QuickCreateProductDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsNumber()
    @IsOptional()
    brand_id?: number;

    @IsArray()
    @IsOptional()
    variant_names?: string[];
}
