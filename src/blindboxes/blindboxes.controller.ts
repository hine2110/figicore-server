import { Controller, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { BlindboxesService } from './blindboxes.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('blindboxes')
export class BlindboxesController {
    constructor(private readonly blindboxesService: BlindboxesService) { }

    @Post('open')
    @UseGuards(AuthGuard('jwt'))
    async openBlindbox(@Req() req, @Body() body: { order_item_id: number }) {
        if (!body.order_item_id) {
            throw new BadRequestException("order_item_id is required");
        }
        return this.blindboxesService.openBlindbox(req.user.user_id, body.order_item_id);
    }
}
