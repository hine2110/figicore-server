import { IsString, IsNotEmpty, MinLength, IsOptional, Matches } from 'class-validator';

export class ActivateAccountDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  tempPassword: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.',
  })
  newPassword: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  faceDescriptor?: string;
}
