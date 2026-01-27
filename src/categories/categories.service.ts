import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) { }

  findAll() {
    return this.prisma.categories.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async quickCreate(name: string, parent_id?: number) {
    if (!name) return null;
    const trimmedName = name.trim();
    // Simple Slug Generation
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    try {
      return await this.prisma.categories.create({
        data: {
          name: trimmedName,
          slug: slug,
          parent_id: parent_id || null
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return this.prisma.categories.findUnique({
          where: { name: trimmedName }
        });
      }
      throw error;
    }
  }
}
