import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ReplyDisputeDto {
    @IsString()
    @IsNotEmpty()
    response: string;

    @IsString()
    @IsNotEmpty()
    @IsIn(['RESOLVED', 'CLOSED', 'OPEN'])
    status_code: string;
}