import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { LivestreamsService } from './livestreams.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('livestreams-ai')
export class LivestreamsAiController {
  constructor(private readonly livestreamsService: LivestreamsService) {}

  @Get('suggest-price/:variantId')
  suggestFlashSale(@Param('variantId') variantId: string) {
    return this.livestreamsService.suggestFlashPrice(+variantId);
  }
}
