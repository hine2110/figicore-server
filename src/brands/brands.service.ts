import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) { }

  findAll() {
    return this.prisma.brands.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async quickCreate(name: string) {
    if (!name) return null;
    const trimmedName = name.trim();

    try {
      return await this.prisma.brands.create({
        data: { name: trimmedName },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
        return this.prisma.brands.findUnique({
          where: { name: trimmedName },
        });
      }
    }
      throw error;
    }
  }
}
