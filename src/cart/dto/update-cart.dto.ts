import { PartialType } from '@nestjs/mapped-types';
import { CreateCartDto } from './create-cart.dto';

export class UpdateCartDto extends PartialType(CreateCartDto) {
    productId?: number;
    quantity?: number;
    variantId?: number;
    paymentOption?: string;
    livestreamId?: number;
}
