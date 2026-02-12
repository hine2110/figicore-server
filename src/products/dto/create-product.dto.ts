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

class ProductVariantPreorderConfigDto {
    @IsNumber()
    @Min(0)
    deposit_amount: number;

    @IsNumber()
    @Min(0)
    full_price: number;

    @IsNumber()
    @Min(0)
    total_slots: number;

    @IsNumber()
    @Min(1)
    max_qty_per_user: number;

    @IsString()
    @IsOptional()
    release_date?: string;
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

    // REMOVED old separate fields -> Moved to preorder_config
    // deposit_amount, preorder_slot_limit

    @IsOptional()
    @ValidateNested()
    @Type(() => ProductVariantPreorderConfigDto)
    preorder_config?: ProductVariantPreorderConfigDto;

    @IsNumber()
    @IsOptional()
    @Min(0)
    weight_g?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    length_cm?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    width_cm?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    height_cm?: number;

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

    @IsString()
    @IsOptional()
    scale?: string;

    @IsString()
    @IsOptional()
    material?: string;

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    included_items?: string[];
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
    @IsOptional()
    @Min(0)
    full_price?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    deposit_amount?: number;

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

    @ValidateIf(o => o.type_code === ProductType.RETAIL || o.type_code === ProductType.PREORDER)
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
