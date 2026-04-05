import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkScheduleDto } from './create-work-schedule.dto';

export class UpdateWorkScheduleDto extends PartialType(CreateWorkScheduleDto) {
    user_id?: number;
    date?: string;
    shift_code?: string;
    expected_start?: string;
    expected_end?: string;
}
