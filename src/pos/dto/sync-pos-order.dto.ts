
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
}
