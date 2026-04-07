import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  avatar_url?: string;
}


export class UpdateBankInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_account_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_account_name?: string;

  @IsOptional()
  @IsString()
  bank_qr_code_url?: string;
}

