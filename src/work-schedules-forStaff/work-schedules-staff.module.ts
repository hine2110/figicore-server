import { Module } from '@nestjs/common';
import { WorkSchedulesStaffService } from './work-schedules-staff.service';
import { WorkSchedulesStaffController } from './work-schedules-staff.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WorkSchedulesStaffController],
    providers: [WorkSchedulesStaffService],
})
export class WorkSchedulesStaffModule { }
