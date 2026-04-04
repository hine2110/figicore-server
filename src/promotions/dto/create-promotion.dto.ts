import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_value?: number;

  @IsOptional()
  @IsString()
  discount_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_value?: number;

  @IsOptional()
  @IsString()
  apply_rank_code?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_quantity?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
