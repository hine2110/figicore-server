import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto, ProductType } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
    name?: string;
    type_code?: ProductType;
    brand_id?: number;
    category_id?: number;
    series_id?: number;
    description?: string;
    status_code?: string;
    media_urls?: string[];
    variants?: any[];
    blindbox?: any;
    preorder?: any;
}
