import { Module } from '@nestjs/common';
import { PayrollDisputesService } from './payroll-disputes.service';
import { PayrollDisputesController } from './payroll-disputes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [PayrollDisputesController],
    providers: [PayrollDisputesService],
})
export class PayrollDisputesModule { }