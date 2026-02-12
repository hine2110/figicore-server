import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get()
    getMyWallet(@Req() req) {
        return this.walletService.getMyWallet(req.user.user_id);
    }
}
