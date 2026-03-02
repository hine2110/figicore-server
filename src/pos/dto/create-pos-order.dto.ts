import { IsNotEmpty, IsNumber, IsPositive, IsArray, ValidateNested, IsOptional, IsString, IsBoolean, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PosOrderItemDto } from './pos-order-item.dto';

export class CreatePosOrderDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PosOrderItemDto)
    items: PosOrderItemDto[];

    @IsNotEmpty()
    @IsString()
    payment_method_code: string; // CASH, QR_BANK, WALLET

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    user_id?: number; // null nếu là khách vãng lai

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsNumber()
    @IsPositive()
    @Type(() => Number)
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

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    cash_received?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    cash_change?: number;
}
