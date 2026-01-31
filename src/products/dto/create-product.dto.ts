import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsNumber, Min, IsEnum, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductType {
    RETAIL = 'RETAIL',
    BLINDBOX = 'BLINDBOX',
    PREORDER = 'PREORDER',
}

class MediaAssetDto {
    @IsEnum(['IMAGE', 'VIDEO'])
    type: 'IMAGE' | 'VIDEO';

    @IsEnum(['CLOUDINARY', 'YOUTUBE'])
    source: 'CLOUDINARY' | 'YOUTUBE';

    @IsString()
    @IsNotEmpty()
    url: string;
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

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => MediaAssetDto)
    media_assets?: MediaAssetDto[];

    @IsString()
    @IsOptional()
    description?: string;
}

class ProductBlindboxDto {
    @IsNumber()
    @Min(0)
    price: number;

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
    full_price: number;

    @IsNumber()
    @Min(0)
    deposit_amount: number;

    @IsString()
    @IsNotEmpty()
    release_date: string;

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

    @ValidateIf(o => o.type_code === ProductType.RETAIL)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductVariantDto)
    variants?: ProductVariantDto[];

    @ValidateIf(o => o.type_code === ProductType.BLINDBOX)
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ProductBlindboxDto)
    blindbox?: ProductBlindboxDto;

    @ValidateIf(o => o.type_code === ProductType.PREORDER)
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ProductPreorderDto)
    preorder?: ProductPreorderDto;
}
