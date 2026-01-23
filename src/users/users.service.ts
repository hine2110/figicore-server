
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async create(data: any) {
    return this.prisma.users.create({
      data,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({
      where: { email },
    });
  }

  async findByVerificationToken(token: string) {
    return this.prisma.users.findFirst({
      where: { verification_token: token },
    });
  }

  async findOne(id: number) {
    return this.prisma.users.findUnique({
      where: { user_id: id },
    });
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.email === 'admin@figicore.com' || user.role_code === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot delete Super Admin');
    }

    return this.prisma.users.delete({
      where: { user_id: id },
    });
  }

  // Placeholder methods for controller compatibility if needed
  findAll() {
    return this.prisma.users.findMany();
  }

  update(id: number, data: any) {
    return this.prisma.users.update({
      where: { user_id: id },
      data,
    });
  }
}
