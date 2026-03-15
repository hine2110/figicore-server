import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateProductPromotionDto {
  @IsString()
  name: string;

  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  type_code: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @IsNumber()
  @Min(0)
  value: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'start_time must be in HH:mm format (e.g. 09:00)' })
  start_time: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'end_time must be in HH:mm format (e.g. 11:00)' })
  end_time: string;

  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean;

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
