import { IsString, IsNotEmpty, IsOptional, IsArray, IsInt, IsISO8601 } from 'class-validator';

export class CreateLivestreamDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsISO8601()
    @IsOptional()
    start_time?: string;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    product_ids?: number[];
}
