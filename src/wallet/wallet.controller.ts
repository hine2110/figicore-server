import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';

@Controller('wallets')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get('my-wallet')
    getMyWallet(@Req() req) {
        return this.walletService.getMyWallet(req.user.user_id);
    }

    @Post('top-up')
    createTopUpRequest(@Req() req, @Body('amount') amount: number) {
        return this.walletService.createTopUpRequest(req.user.user_id, amount);
    }
}
