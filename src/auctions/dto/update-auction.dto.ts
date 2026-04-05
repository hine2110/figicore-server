import { PartialType } from '@nestjs/mapped-types';
import { CreateAuctionDto } from './create-auction.dto';

export class UpdateAuctionDto extends PartialType(CreateAuctionDto) {
    variant_id?: number;
    start_price?: number;
    step_price?: number;
    deposit_fee?: number;
    max_participants?: number;
    start_time?: string;
    end_time?: string;
}
