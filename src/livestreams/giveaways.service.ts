import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GiveawaysService {
  constructor(private prisma: PrismaService) {}

  async createGiveaway(livestreamId: number, data: { variantId: number; keyword: string; slotsLimit: number }) {
    return this.prisma.livestream_giveaways.create({
      data: {
        livestream_id: livestreamId,
        variant_id: data.variantId,
        keyword: data.keyword,
        slots_limit: data.slotsLimit,
        status_code: 'PENDING',
      },
      include: {
        product_variants: {
          include: {
            products: true
          }
        }
      }
    });
  }

  async getGiveawaysByLive(livestreamId: number) {
    return this.prisma.livestream_giveaways.findMany({
      where: { livestream_id: livestreamId },
      include: {
        product_variants: {
          include: {
            products: true
          }
        },
        winner: {
          select: {
            full_name: true,
            email: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async getGiveawayById(id: number) {
    const giveaway = await this.prisma.livestream_giveaways.findUnique({
      where: { id },
      include: {
        product_variants: true
      }
    });
    if (!giveaway) throw new NotFoundException(`Giveaway #${id} not found`);
    return giveaway;
  }

  async updateStatus(id: number, status: string) {
    if (!id) {
      throw new Error('Giveaway ID is required for status update');
    }
    return this.prisma.livestream_giveaways.update({
      where: { id },
      data: { status_code: status }
    });
  }

  async recordWinner(id: number, winnerUserId: number) {
    return this.prisma.livestream_giveaways.update({
      where: { id },
      data: { 
        winner_user_id: winnerUserId,
        status_code: 'ENDED',
        updated_at: new Date()
      }
    });
  }
}
