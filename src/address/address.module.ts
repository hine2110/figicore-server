
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AddressController } from './address.controller';
import { GhnService } from './ghn.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    imports: [HttpModule],
    controllers: [AddressController],
    providers: [GhnService, PrismaService],
    exports: [GhnService], // Export GhnService for use in other modules
})
export class AddressModule { }
