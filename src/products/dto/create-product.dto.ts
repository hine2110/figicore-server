
import { IsEnum, IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsNotEmpty, ValidateIf, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductType {
    RETAIL = 'RETAIL',
    BLINDBOX = 'BLINDBOX',
    PREORDER = 'PREORDER',
}

class ProductVariantDto {
    @IsString()
    @IsNotEmpty()
    option_name: string;

    @IsString()
    @IsNotEmpty()
    sku: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    stock_available?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    stock_defect?: number;

    @IsString()
    @IsOptional()
    barcode?: string;

    @IsString()
    @IsOptional()
    image_url?: string;
}

class ProductBlindboxDto {
    @IsNumber()
    @Min(0)
    price: number; // Price of the blindbox itself

    @IsNumber()
    @IsOptional()
    @Min(0)
    min_value_allow?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    max_value_allow?: number;

    @IsNumber()
    @IsOptional()
    target_margin?: number;
}

class ProductPreorderDto {
    @IsNumber()
    @Min(0)
    full_price: number; // New field

    @IsNumber()
    @Min(0)
    deposit_amount: number;

    @IsString()
    @IsNotEmpty()
    release_date: string; // ISO Date string

    @IsNumber()
    @IsOptional()
    @Min(1)
    max_slots?: number;
}

export class CreateProductDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(ProductType)
    @IsNotEmpty()
    type_code: ProductType;

    @IsNumber()
    @IsOptional()
    brand_id?: number;

    @IsNumber()
    @IsOptional()
    category_id?: number;

    @IsNumber()
    @IsOptional()
    series_id?: number;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    status_code?: string;

    @IsArray()
    @IsOptional()
    media_urls?: string[];

    // --- RETAIL VARIANTS ---
    @ValidateIf(o => o.type_code === ProductType.RETAIL)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductVariantDto)
    variants?: ProductVariantDto[];

    // --- BLINDBOX CONFIG ---
    @ValidateIf(o => o.type_code === ProductType.BLINDBOX)
    @IsNotEmpty({ message: 'Blindbox configuration is required' })
    @ValidateNested()
    @Type(() => ProductBlindboxDto)
    blindbox?: ProductBlindboxDto;

    // --- PREORDER CONFIG ---
    @ValidateIf(o => o.type_code === ProductType.PREORDER)
    @IsNotEmpty({ message: 'Preorder configuration is required' })
    @ValidateNested()
    @Type(() => ProductPreorderDto)
    preorder?: ProductPreorderDto;
}
