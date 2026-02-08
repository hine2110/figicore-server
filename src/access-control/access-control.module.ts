import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [AccessControlController],
    providers: [AccessControlService],
    exports: [AccessControlService],
})
export class AccessControlModule { }
