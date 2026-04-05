import { PartialType } from '@nestjs/mapped-types';
import { CreateProductPromotionDto } from './create-product-promotion.dto';

export class UpdateProductPromotionDto extends PartialType(CreateProductPromotionDto) {
  name?: string;
  type_code?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value?: number;
  start_time?: string;
  end_time?: string;
  is_recurring?: boolean;
  is_active?: boolean;
  min_apply_price?: number;
  max_apply_price?: number;
  start_date?: string;
  end_date?: string;
  is_flash_sale?: boolean;
  items?: any[];
}
