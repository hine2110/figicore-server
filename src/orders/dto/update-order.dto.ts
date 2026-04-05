import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
    shipping_address_id?: number;
    payment_method_code?: string;
    shipping_fee?: number;
    original_shipping_fee?: number;
    discountVoucherCode?: string;
    freeShipVoucherCode?: string;
    items?: any[];
}
