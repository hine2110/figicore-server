import { PartialType } from '@nestjs/mapped-types';
import { CreatePromotionDto } from './create-promotion.dto';

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {
  discount_type?: string;
  discount_value?: number;
  min_order_value?: number;
  is_active?: boolean;
}
