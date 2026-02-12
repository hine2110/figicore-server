import { IsNotEmpty, IsNumber, IsPositive, IsArray, ValidateNested, IsOptional, IsString } from 'class-validator';
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

}
