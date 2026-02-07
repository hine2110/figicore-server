import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe, Query, BadRequestException, UseInterceptors, UploadedFile, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    return this.usersService.getProfile(req.user.user_id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  updateProfile(@Req() req, @Body() data: { full_name: string; phone: string }) {
    return this.usersService.updateProfile(req.user.user_id, data);
  }

  @Post('avatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
      if (!file) throw new BadRequestException('File is required');
      return this.usersService.updateAvatar(req.user.user_id, file);
  }

  @Post('profile/request-update')
  @UseGuards(AuthGuard('jwt'))
  requestUpdate(@Req() req, @Body() data: any) {
    return this.usersService.createProfileUpdateRequest(req.user.user_id, data);
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'))
  async createBulk(@Body() body: any) {
    // 1. Normalize Input
    let usersList: any[] = [];
    if (body.users && Array.isArray(body.users)) {
      usersList = body.users;
    } else if (Array.isArray(body)) {
      usersList = body;
    } else {
      usersList = [body];
    }

    if (!usersList.length || (usersList.length === 1 && !usersList[0])) {
       throw new BadRequestException("No user data provided");
    }

    // 2. Clean Log
    console.log(`[BulkCreate] Processing request for ${usersList.length} users...`);

    // 3. Call Service
    const result = await this.usersService.createBulk({ users: usersList });

    // 4. Success Log
    console.log(`[BulkCreate] Successfully created ${result.length} employees.`);
    
    return result;
  }

  @Post('import-zip')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async importZip(@UploadedFile() file: Express.Multer.File) {
      if (!file) throw new BadRequestException('File is required');
      
      // Basic MIME check, though extensions can vary. 
      // zip, x-zip-compressed, octet-stream are common.
      const allowedMimes = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'application/x-zip'];
      if (!allowedMimes.includes(file.mimetype)) {
          // Fallback check on extension if mime is generic octet-stream
          if (!file.originalname.match(/\.(zip)$/i)) {
             throw new BadRequestException('Invalid file type. Only ZIP files are allowed.');
          }
      }

      return this.usersService.importUsersFromZip(file);
  }

  @Get('preview-email')
  @UseGuards(AuthGuard('jwt'))
  getPreviewEmail(@Query('role') role: string) {
      if (!role) throw new BadRequestException('Role is required');
      return this.usersService.getPreviewEmail(role);
  }

  @Get('next-id')
  @UseGuards(AuthGuard('jwt'))
  getNextEmployeeId(@Query('role') role: string) {
      if (!role) throw new BadRequestException('Role is required');
      return this.usersService.getNextEmployeeId(role);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateStatus(
      @Param('id', ParseIntPipe) id: number, 
      @Body('status') status: 'ACTIVE' | 'INACTIVE' | 'BANNED',
      @Body('reason') reason?: string,
      @Req() req?
  ) {
    // Prevent banning self
    if (req?.user?.user_id === id && status === 'BANNED') {
        throw new BadRequestException('You cannot ban yourself');
    }
    return this.usersService.updateStatus(id, status, reason);
  }


  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}
