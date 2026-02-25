import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReturnItemDto {
    @IsInt()
    @Min(1)
    order_item_id: number;

    @IsInt()
    @Min(1)
    quantity: number;
}

export class CreateReturnDto {
    @IsInt()
    @Min(1)
    order_id: number;

    @IsOptional()
    @IsString()
    reason?: string;

    @IsNotEmpty({ message: 'Video evidence is required' })
    @IsString()
    unbox_video_url: string;

    @IsOptional()
    @IsString()
    defect_image_urls?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReturnItemDto)
    items: ReturnItemDto[];
}
