import { PartialType } from '@nestjs/mapped-types';
import { CreatePromotionDto } from './create-promotion.dto';

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {
  code?: string;
  discount_value?: number;
  discount_type?: string;
  min_order_value?: number;
  max_discount_amount?: number;
  apply_rank_code?: string;
  max_quantity?: number;
  is_public?: boolean;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
}
