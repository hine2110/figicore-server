
import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
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
      include: { customers: true },
    });
  }



  async findOne(id: number) {
    return this.prisma.users.findUnique({
      where: { user_id: id },
      include: { customers: true },
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

  async updateProfile(userId: number, data: { full_name?: string; phone?: string }) {
    // Check phone uniqueness if phone is provided
    if (data.phone) {
      const existingUser = await this.prisma.users.findUnique({
        where: { phone: data.phone },
      });

      if (existingUser && existingUser.user_id !== userId) {
        throw new BadRequestException('Phone number is already taken');
      }
    }

    return this.prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: data.full_name,
        phone: data.phone,
      },
    });
  }

  update(id: number, data: any) {
    return this.prisma.users.update({
      where: { user_id: id },
      data,
    });
  }
}
