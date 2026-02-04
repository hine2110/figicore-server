import { IsInt, IsNotEmpty, IsArray, IsNumber, IsString, ValidateNested, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class CreateOrderItemDto {
    @IsInt()
    @Min(1)
    variant_id: number;

    @IsInt()
    @Min(1)
    quantity: number;

    @IsNumber()
    @Min(0)
    price: number;
}

export class CreateOrderDto {
    @IsInt()
    @IsNotEmpty()
    shipping_address_id: number;

    @IsString()
    @IsNotEmpty()
    payment_method_code: string;

    @IsNumber()
    shipping_fee: number;

    @IsOptional()
    @IsNumber()
    original_shipping_fee?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items: CreateOrderItemDto[];
}
