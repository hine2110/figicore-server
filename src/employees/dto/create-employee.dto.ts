import { IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MinLength, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum AllowedEmployeeRole {
  MANAGER = 'MANAGER',
  STAFF_POS = 'STAFF_POS',
  STAFF_INVENTORY = 'STAFF_INVENTORY',
}

export class CreateEmployeeDto {
  // User Fields
  @IsEmail({}, { message: 'Invalid email format' })
  @IsOptional()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(15)
  phone: string;

  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEnum(AllowedEmployeeRole, {
    message: 'Role must be one of: MANAGER, STAFF_POS, STAFF_INVENTORY',
  })
  @IsNotEmpty()
  role_code: AllowedEmployeeRole;

  // Employee Fields
  @IsString()
  @IsOptional()
  employee_code?: string;

  @IsString()
  @IsNotEmpty()
  job_title_code: string;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  @Type(() => Number)
  @Transform(({ value }) => Number(value))
  base_salary: number;

  @IsOptional()
  @Type(() => Date)
  start_date?: Date;
}
