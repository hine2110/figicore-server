import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER') 
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('requests')
  getPendingRequests() {
    return this.usersService.getPendingRequests();
  }

  @Post('request/:id/approve')
  approveRequest(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.resolveRequest(id, 'APPROVED');
  }

  @Post('request/:id/reject')
  rejectRequest(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.resolveRequest(id, 'REJECTED');
  }
}
