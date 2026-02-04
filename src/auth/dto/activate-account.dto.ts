import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ActivateAccountDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  tempPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
