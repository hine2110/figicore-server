
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested, IsBoolean, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

class SyncOrderItemDto {
    @IsInt()
    variant_id: number;

    @IsInt()
    @Min(1)
    quantity: number;
}

export class SyncPosOrderDto {
    @IsOptional()
    @IsInt()
    user_id?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SyncOrderItemDto)
    items: SyncOrderItemDto[];

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    discount_amount?: number;

    // VAT Mock Fields
    @IsOptional()
    @IsBoolean()
    is_vat_export?: boolean;

    @IsOptional()
    @IsString()
    vat_tax_number?: string;

    @IsOptional()
    @IsString()
    vat_company_name?: string;

    @IsOptional()
    @IsString()
    vat_company_address?: string;

    @IsOptional()
    @IsEmail()
    @IsString()
    vat_invoice_email?: string;
}
