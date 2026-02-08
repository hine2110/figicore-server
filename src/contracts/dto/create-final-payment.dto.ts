import { IsArray, IsInt, IsNotEmpty, IsString, IsOptional, Min } from 'class-validator';

export class CreateFinalPaymentDto {
    @IsArray()
    @IsInt({ each: true })
    contract_ids: number[];

    @IsInt()
    @IsNotEmpty()
    shipping_address_id: number;

    @IsString()
    @IsNotEmpty()
    payment_method_code: string;

    @IsOptional()
    @IsString()
    voucherCode?: string; // Prompt mentioned "allow User to apply a new Voucher at the Final Checkout"
}
