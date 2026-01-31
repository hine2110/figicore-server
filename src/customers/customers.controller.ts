
import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe, Param, Request } from '@nestjs/common';

import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) { }

  @Get('dashboard-stats')
  @UseGuards(JwtAuthGuard)
  getDashboardStats(@Request() req: any) {
    const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
    return this.customersService.getDashboardStats(userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER', 'STAFF_POS')
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(page, limit, search);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER', 'STAFF_POS')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findOne(id);
  }
}
