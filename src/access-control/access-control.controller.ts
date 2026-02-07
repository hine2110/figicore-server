import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { CreateAccessControlDto } from './dto/create-access-control.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/access-controls')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AccessControlController {
    constructor(private readonly accessControlService: AccessControlService) { }

    @Post()
    create(@Body() createAccessControlDto: CreateAccessControlDto) {
        return this.accessControlService.create(createAccessControlDto);
    }

    @Get()
    findAll(@Query('role_code') role_code?: string) {
        return this.accessControlService.findAll(role_code);
    }

    @Patch(':id/toggle')
    toggleActive(@Param('id', ParseIntPipe) id: number) {
        return this.accessControlService.toggleActive(id);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.accessControlService.remove(id);
    }
}
