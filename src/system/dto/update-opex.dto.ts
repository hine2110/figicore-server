import { IsNumber, Min, Max } from 'class-validator';

export class UpdateOpexDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  marketing_pct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  staff_pct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  storage_pct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  risk_pct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  tax_pct: number;
}
