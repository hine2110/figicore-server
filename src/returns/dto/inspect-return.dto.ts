import { IsArray, IsEnum, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum InspectionResult {
    RESTOCK = 'RESTOCK',
    BOX_DAMAGE = 'BOX_DAMAGE',
    FACTORY_DEFECT = 'FACTORY_DEFECT',
    FRAUD = 'FRAUD'
}

class InspectedItemDto {
    @IsInt()
    @Min(1)
    return_item_id: number;

    @IsEnum(InspectionResult)
    result: InspectionResult;
}

export class InspectReturnDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InspectedItemDto)
    items: InspectedItemDto[];
}
