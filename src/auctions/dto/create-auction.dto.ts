import { IsInt, IsNotEmpty, IsNumber, IsISO8601, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAuctionDto {
    @IsInt()
    @IsNotEmpty()
    variant_id: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    start_price: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    step_price: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    deposit_fee: number;

    @IsNumber()
    @Min(1)
    @Type(() => Number)
    max_participants: number;

    @IsISO8601()
    @IsNotEmpty()
    start_time: string;

    @IsISO8601()
    @IsNotEmpty()
    end_time: string;
}
