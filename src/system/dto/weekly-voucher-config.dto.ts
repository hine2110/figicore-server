import { IsBoolean, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RankConfigDto {
  @IsNumber()
  @Min(0)
  value: number; // % discount or 0 for freeship

  @IsNumber()
  @Min(0)
  minOrder: number;

  @IsNumber()
  @Min(0)
  maxCap: number;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class UpdateWeeklyVoucherConfigDto {
  @IsBoolean()
  is_enabled: boolean;

  @ValidateNested()
  @Type(() => RankConfigDto)
  BRONZE: RankConfigDto;

  @ValidateNested()
  @Type(() => RankConfigDto)
  SILVER: RankConfigDto;

  @ValidateNested()
  @Type(() => RankConfigDto)
  GOLD: RankConfigDto;

  @ValidateNested()
  @Type(() => RankConfigDto)
  DIAMOND: RankConfigDto;
}
