import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuctionsService {
  constructor(private prisma: PrismaService) { }

  async create(createAuctionDto: CreateAuctionDto) {
    // 1. Verify that the product variant exists and belongs to an AUCTION product type
    const variant = await this.prisma.product_variants.findUnique({
      where: { variant_id: createAuctionDto.variant_id },
      include: { products: true }
    });

    if (!variant) {
      throw new BadRequestException('Product variant not found');
    }

    if (variant.products.type_code !== 'AUCTION') {
      throw new BadRequestException('Product type must be AUCTION to create an auction room');
    }

    // 2. Ensure no overlapping active auction for the same variant
    const existingActive = await this.prisma.auctions.findFirst({
      where: {
        variant_id: createAuctionDto.variant_id,
        status_code: { in: ['DRAFT', 'UPCOMING', 'ACTIVE'] }
      }
    });

    if (existingActive) {
      throw new BadRequestException('An active or upcoming auction already exists for this variant');
    }

    // 3. Set the correct status based on start time
    const now = new Date();
    const startTime = new Date(createAuctionDto.start_time);
    const endTime = new Date(createAuctionDto.end_time);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    let status = 'UPCOMING';
    if (startTime <= now && endTime > now) {
      status = 'ACTIVE';
    }

    // 4. Create the auction
    const newAuction = await this.prisma.auctions.create({
      data: {
        variant_id: createAuctionDto.variant_id,
        start_price: createAuctionDto.start_price,
        step_price: createAuctionDto.step_price,
        deposit_fee: createAuctionDto.deposit_fee,
        max_participants: createAuctionDto.max_participants,
        start_time: startTime,
        end_time: endTime,
        status_code: status
      }
    });

    return {
      message: 'Auction created successfully',
      auction: newAuction
    };
  }

  async findAll() {
    return this.prisma.auctions.findMany({
      include: {
        product_variants: {
          include: {
            products: {
              include: { brands: true, series: true, categories: true }
            }
          }
        },
        _count: {
          select: { auction_participants: true, auction_bids: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findOne(id: number) {
    return this.prisma.auctions.findUnique({
      where: { auction_id: id },
      include: {
        product_variants: {
          include: { products: true }
        },
        users: { select: { user_id: true, full_name: true, email: true } }, // Winner info
        auction_participants: {
          include: { users: { select: { full_name: true, email: true } } }
        },
        auction_bids: {
          include: { users: { select: { full_name: true, email: true } } },
          orderBy: { bid_amount: 'desc' }
        }
      }
    });
  }

  async update(id: number, updateAuctionDto: UpdateAuctionDto) {
    const auction = await this.prisma.auctions.findUnique({ where: { auction_id: id } });
    if (!auction) throw new BadRequestException('Auction not found');

    if (auction.status_code !== 'DRAFT' && auction.status_code !== 'UPCOMING') {
      // Cannot modify business rules if auction has started
      throw new BadRequestException('Cannot modify an auction that is already active or completed');
    }

    const data: any = { ...updateAuctionDto };
    if (updateAuctionDto.start_time) data.start_time = new Date(updateAuctionDto.start_time);
    if (updateAuctionDto.end_time) data.end_time = new Date(updateAuctionDto.end_time);

    return this.prisma.auctions.update({
      where: { auction_id: id },
      data
    });
  }

  async remove(id: number) {
    const auction = await this.prisma.auctions.findUnique({ where: { auction_id: id } });
    if (!auction) throw new BadRequestException('Auction not found');

    if (auction.status_code !== 'DRAFT' && auction.status_code !== 'UPCOMING') {
      throw new BadRequestException('Cannot delete an auction that is already active or has history');
    }

    return this.prisma.auctions.delete({ where: { auction_id: id } });
  }

  async joinRoom(auctionId: number, userId: number) {
    // 1. Fetch Auction
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        _count: {
          select: { auction_participants: true }
        }
      }
    });

    if (!auction) {
      throw new BadRequestException('Auction not found');
    }

    if (auction.status_code !== 'ACTIVE' && auction.status_code !== 'UPCOMING') {
      throw new BadRequestException('Auction is not open for joining');
    }

    // 2. Check if already joined
    const existingParticipant = await this.prisma.auction_participants.findUnique({
      where: {
        auction_id_user_id: {
          auction_id: auctionId,
          user_id: userId
        }
      }
    });

    if (existingParticipant) {
      return { success: true, message: 'Already joined', participant: existingParticipant };
    }

    // 3. Check capacity
    if (auction._count.auction_participants >= auction.max_participants) {
      throw new BadRequestException('Auction room is at full capacity');
    }

    // 4. Proceed with Transaction: Check Wallet -> Deduct -> Lock -> Create Participant
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallets.findUnique({
        where: { user_id: userId }
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found for this user');
      }

      if (Number(wallet.balance_available) < Number(auction.deposit_fee)) {
        throw new BadRequestException('Insufficient wallet balance for security deposit');
      }

      // Update Wallet
      const updatedWallet = await tx.wallets.update({
        where: { wallet_id: wallet.wallet_id },
        data: {
          balance_available: { decrement: auction.deposit_fee },
          balance_locked: { increment: auction.deposit_fee }
        }
      });

      // Log Transaction
      await tx.wallet_transactions.create({
        data: {
          wallet_id: wallet.wallet_id,
          type_code: 'DEPOSIT_LOCK',
          amount: auction.deposit_fee,
          reference_code: `AUCTION_${auctionId}`,
          description: `Locked security deposit for Auction #${auctionId}`
        }
      });

      // Create Participant Role
      const participant = await tx.auction_participants.create({
        data: {
          auction_id: auctionId,
          user_id: userId,
          deposit_amount: auction.deposit_fee,
          status: 'JOINED' // JOINED
        }
      });

      return {
        success: true,
        message: 'Successfully joined the auction room',
        participant,
        newBalance: updatedWallet.balance_available
      };
    });
  }
}
