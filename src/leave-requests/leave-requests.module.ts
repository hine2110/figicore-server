import { Module } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
    imports: [PrismaModule],
    controllers: [LeaveRequestsController],
    providers: [LeaveRequestsService, EncryptionService],
    exports: [LeaveRequestsService]
})
export class LeaveRequestsModule { }
