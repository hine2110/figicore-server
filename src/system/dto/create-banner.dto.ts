import { IsString, IsOptional, IsInt, IsBoolean, IsUrl } from 'class-validator';

export class CreateBannerDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsUrl()
  image_url: string;

  @IsString()
  @IsOptional()
  target_url?: string;

  @IsInt()
  @IsOptional()
  sort_order?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
