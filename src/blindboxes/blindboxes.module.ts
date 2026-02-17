import { Module } from '@nestjs/common';
import { BlindboxesService } from './blindboxes.service';
import { BlindboxesController } from './blindboxes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [BlindboxesController],
    providers: [BlindboxesService],
    exports: [BlindboxesService]
})
export class BlindboxesModule { }
