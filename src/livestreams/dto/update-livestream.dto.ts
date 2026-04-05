import { PartialType } from '@nestjs/mapped-types';
import { CreateLivestreamDto } from './create-livestream.dto';

export class UpdateLivestreamDto extends PartialType(CreateLivestreamDto) {
    title?: string;
    description?: string;
    start_time?: string;
    product_ids?: number[];
}
