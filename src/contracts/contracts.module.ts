import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [ContractsController],
    providers: [ContractsService, PrismaService],
    exports: [ContractsService]
})
export class ContractsModule { }
