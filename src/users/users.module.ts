import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { AdminController } from './admin.controller';

import { PrismaModule } from '../prisma/prisma.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    PrismaModule, 
    UploadModule, 
    MailModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
      signOptions: { expiresIn: '12h' },
    })
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
