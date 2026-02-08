import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsService } from './contracts.service';

@Controller('contracts')
export class ContractsController {
    constructor(private readonly contractsService: ContractsService) { }

    @Get('my-contracts')
    @UseGuards(AuthGuard('jwt'))
    getMyContracts(@Req() req) {
        return this.contractsService.getMyContracts(req.user.user_id);
    }
}
