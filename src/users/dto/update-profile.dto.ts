import { IsEmail, IsNotEmpty, MinLength, Matches, IsOptional, MaxLength, IsUrl, IsDateString, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  full_name?: string;

  @Matches(/^0\d{9}$/, { message: 'Phone must be exactly 10 digits and start with 0' })
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;
}
