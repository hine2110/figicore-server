import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeriesService {
  constructor(private prisma: PrismaService) { }

  findAll() {
    return this.prisma.series.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async quickCreate(name: string) {
    if (!name) return null;
    const trimmedName = name.trim();

    try {
      return await this.prisma.series.create({
        data: { name: trimmedName },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return this.prisma.series.findUnique({
          where: { name: trimmedName }
        });
      }
      throw error;
    }
  }
}
