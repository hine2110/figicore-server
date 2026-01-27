import { Module } from '@nestjs/common';
import { WorkSchedulesService } from './work-schedules.service';
import { WorkSchedulesController } from './work-schedules.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WorkSchedulesController],
    providers: [WorkSchedulesService],
})
export class WorkSchedulesModule { }
