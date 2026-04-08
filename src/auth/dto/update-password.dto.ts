import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';

export class UpdatePasswordDto {
  @IsOptional()
  @IsString()
  oldPassword?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: 'Password must be at least 8 characters long and include an uppercase letter, a number, and a special character.',
  })
  newPassword: string;
}
