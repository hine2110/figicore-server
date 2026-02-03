import { IsString, IsNotEmpty, IsEmail, IsNumber } from 'class-validator';

export class ImportEmployeeDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  role_code: string;

  @IsNumber()
  @IsNotEmpty()
  base_salary: number;
}
