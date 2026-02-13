import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductPromotionDto {
  @IsString()
  name: string;

  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  type_code: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @IsNumber()
  @Min(0)
  value: number;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  min_apply_price?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  max_apply_price?: number;
}
