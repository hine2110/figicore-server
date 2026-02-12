import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WalletController],
    providers: [WalletService],
    exports: [WalletService] // Export service so OrdersModule can use it
})
export class WalletModule { }
