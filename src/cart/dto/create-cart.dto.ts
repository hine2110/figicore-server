import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateCartDto {
    @IsInt()
    @IsPositive()
    productId: number;

    @IsInt()
    @IsPositive()
    quantity: number;

    @IsInt()
    @IsOptional()
    variantId?: number;
}
