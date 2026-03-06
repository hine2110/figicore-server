import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class UpdateLeaveStatusDto {
    @IsString()
    @IsNotEmpty()
    @IsIn(['APPROVED', 'REJECTED'])
    status_code: string;
}
