import { Module } from '@nestjs/common';
import { TimesheetCorrectionsService } from './timesheet-corrections.service';
import { TimesheetCorrectionsController } from './timesheet-corrections.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [TimesheetCorrectionsController],
    providers: [TimesheetCorrectionsService],
    exports: [TimesheetCorrectionsService]
})
export class TimesheetCorrectionsModule { }