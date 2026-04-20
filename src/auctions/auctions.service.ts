import { BadRequestException, NotFoundException, Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsGateway } from './auctions.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AuctionsGateway)) private auctionsGateway: AuctionsGateway,
    private notificationsService: NotificationsService,
    private mailService: MailService,
    private encryption: EncryptionService
  ) { }

  private decryptUser(user: any) {
    if (!user) return null;
    const decrypted = { ...user };
    if (decrypted.email) decrypted.email = this.encryption.decrypt(decrypted.email);
    if (decrypted.phone) decrypted.phone = this.encryption.decrypt(decrypted.phone);
    return decrypted;
  }

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
    const auction = await this.prisma.auctions.findUnique({
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
          include: { users: { select: { user_id: true, full_name: true, email: true } } },
          orderBy: { bid_amount: 'desc' }
        }
      }
    });

    if (!auction) return null;

    // Decrypt all user data
    if (auction.users) {
      auction.users = this.decryptUser(auction.users) as any;
    }

    if (auction.auction_participants) {
      auction.auction_participants = auction.auction_participants.map(p => ({
        ...p,
        users: this.decryptUser(p.users) as any
      }));
    }

    if (auction.auction_bids) {
      auction.auction_bids = auction.auction_bids.map(b => ({
        ...b,
        users: this.decryptUser(b.users) as any
      }));
    }

    return auction;
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
    const result = await this.prisma.$transaction(async (tx) => {
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
        },
        include: {
          users: {
            select: {
              full_name: true,
              email: true
            }
          }
        }
      });

      // Decrypt PII before returning/broadcasting
      if (participant.users) {
        participant.users = this.decryptUser(participant.users) as any;
      }

      return {
        success: true,
        message: 'Successfully joined the auction room',
        participant,
        newBalance: updatedWallet.balance_available
      };
    });

    // 5. Broadcast participation update via Socket
    const roomName = `auction_${auctionId}`;
    this.auctionsGateway.server.to(roomName).emit('participation_updated', {
      userId: userId,
      isJoined: true,
      participant: result.participant
    });

    return result;
  }

  async getMyStatus(auctionId: number, userId: number) {
    const participant = await this.prisma.auction_participants.findUnique({
      where: {
        auction_id_user_id: {
          auction_id: auctionId,
          user_id: userId
        }
      }
    });

    return {
      is_joined: !!participant,
      participant
    };
  }

  async checkout(auctionId: number, userId: number, shippingFee: number = 0) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        product_variants: true,
        auction_participants: {
          where: { user_id: userId }
        },
        auction_bids: {
          where: { user_id: userId },
          orderBy: { bid_amount: 'desc' },
          take: 1
        }
      }
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (!['AWAITING_PAYMENT', 'COMPLETED'].includes(auction.status_code)) {
      throw new BadRequestException('Auction is not in a valid state for payment');
    }

    const participant = auction.auction_participants[0];
    // [Gap 4] Only WINNER can checkout, STANDBY_WINNER was already refunded
    if (!participant || participant.status !== 'WINNER') {
      throw new BadRequestException('You are not authorized to pay for this auction');
    }

    // [Gap 4] Winner price = winner's highest bid
    const winnerTopBid = auction.auction_bids.length > 0
      ? Number(auction.auction_bids[0].bid_amount)
      : Number(auction.final_price ?? auction.start_price);

    const depositAmount = Number(participant.deposit_amount);
    const shippingFeeAmount = Number(shippingFee) || 0;

    // Formula: payable = bid - locked deposit + ship
    const remainingBalance = winnerTopBid - depositAmount + shippingFeeAmount;
    const totalOrderAmount = winnerTopBid + shippingFeeAmount;

    if (remainingBalance < 0) {
      throw new BadRequestException('Calculation error: Deposit exceeds bid amount');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallets.findUnique({ where: { user_id: userId } });
      if (!wallet) throw new BadRequestException('Wallet not found for this user');

      if (Number(wallet.balance_available) < remainingBalance) {
        throw new BadRequestException('Insufficient wallet balance, please top up');
      }

      // Deduct remaining balance (bid - deposit + ship) and unlock deposit
      await tx.wallets.update({
        where: { wallet_id: wallet.wallet_id },
        data: {
          balance_available: { decrement: remainingBalance },
          balance_locked: { decrement: depositAmount }
        }
      });

      // Log: Remaining balance (including shipping)
      if (remainingBalance > 0) {
        await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.wallet_id,
            type_code: 'PAYMENT',
            amount: -remainingBalance,
            reference_code: `AUC_PAY_${auctionId}`,
            description: `Payment for auction #${auctionId}: bid=${winnerTopBid}, ship=${shippingFeeAmount}, deposit applied=${depositAmount}`
          }
        });
      }

      // Log: Deposit applied as partial payment
      await tx.wallet_transactions.create({
        data: {
          wallet_id: wallet.wallet_id,
          type_code: 'DEPOSIT_CONSUMED',
          amount: -depositAmount,
          reference_code: `AUC_DEP_CONS_${auctionId}`,
          description: `Deposit applied to Auction #${auctionId} payment`
        }
      });

      const orderCode = `AUC-${Date.now()}-${userId}`;

      const newOrder = await tx.orders.create({
        data: {
          user_id: userId,
          order_code: orderCode,
          total_amount: totalOrderAmount,
          paid_amount: totalOrderAmount,
          shipping_fee: shippingFeeAmount,
          channel_code: 'AUCTION',
          payment_method_code: 'WALLET',
          status_code: 'PROCESSING',
          note: `Won Auction #${auctionId} at price ${winnerTopBid}`,
          order_items: {
            create: {
              variant_id: auction.variant_id,
              quantity: 1,
              unit_price: winnerTopBid,
              total_price: winnerTopBid
            }
          },
          order_status_history: {
            create: { new_status: 'PROCESSING', note: 'Auction Checkout Completed' }
          }
        }
      });

      // Update participant as paid
      await tx.auction_participants.update({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: userId } },
        data: { status: 'COMPLETED_PAYMENT' }
      });

      // Mark auction as COMPLETED
      await tx.auctions.update({
        where: { auction_id: auctionId },
        data: { status_code: 'COMPLETED' }
      });

      return {
        success: true,
        message: 'Payment success',
        order: newOrder,
        breakdown: {
          winningBid: winnerTopBid,
          depositApplied: depositAmount,
          shippingFee: shippingFeeAmount,
          totalPaid: totalOrderAmount,
          walletDebited: remainingBalance
        }
      };
    });
  }

  async forceEnd(auctionId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: true
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'ACTIVE') {
      throw new BadRequestException('Can only force end ACTIVE auctions');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark auction as completed
      const updatedAuction = await tx.auctions.update({
        where: { auction_id: auctionId },
        data: { status_code: 'COMPLETED' }
      });

      // 2. Refund all participants (Simple refund for force end)
      // For a real end with a winner, logic would be different
      for (const p of auction.auction_participants) {
        if (p.status === 'JOINED' || p.status === 'ACTIVE') {
          // Find wallet
          const wallet = await tx.wallets.findUnique({ where: { user_id: p.user_id } });
          if (wallet) {
            await tx.wallets.update({
              where: { wallet_id: wallet.wallet_id },
              data: {
                balance_available: { increment: p.deposit_amount },
                balance_locked: { decrement: p.deposit_amount }
              }
            });

            await tx.wallet_transactions.create({
              data: {
                wallet_id: wallet.wallet_id,
                type_code: 'DEPOSIT_UNLOCK',
                amount: p.deposit_amount,
                reference_code: `FORCE_END_${auctionId}`,
                description: `Refunded deposit due to forced end of Auction #${auctionId}`
              }
            });

            await tx.auction_participants.update({
              where: { auction_id_user_id: { auction_id: auctionId, user_id: p.user_id } },
              data: { status: 'REFUNDED' }
            });
          }
        }
      }

      return {
        success: true,
        message: 'Auction forcefully ended and deposits refunded.',
        auction: updatedAuction
      };
    });
  }

  async closeRoom(auctionId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId }
    });

    if (!auction) throw new NotFoundException('Auction not found');

    // If already COMPLETED or CANCELLED, do nothing
    if (['COMPLETED', 'CANCELLED'].includes(auction.status_code)) {
      return auction;
    }

    // Explicitly transition to COMPLETED when room is closed
    return this.prisma.auctions.update({
      where: { auction_id: auctionId },
      data: { status_code: 'COMPLETED' }
    });
  }

  async endAuction(auctionId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: true,
        auction_bids: {
          orderBy: { bid_amount: 'desc' }
        }
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'ACTIVE') {
      throw new BadRequestException('Auction is not ACTIVE');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find top 2 distinct users
      const distinctUserIds = [...new Set(auction.auction_bids.map(b => b.user_id))];
      const winnerId = distinctUserIds.length > 0 ? distinctUserIds[0] : null;
      const standbyId = distinctUserIds.length > 1 ? distinctUserIds[1] : null;

      // 1. Mark auction as AWAITING_PAYMENT, set winner & payment deadline (+24h)
      const paymentDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const updatedAuction = await tx.auctions.update({
        where: { auction_id: auctionId },
        data: {
          // If no bids at all -> FAILED_NO_BUYER, otherwise wait for winner to pay
          status_code: winnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER',
          winner_id: winnerId,
          final_price: winnerId && auction.auction_bids.length > 0
            ? auction.auction_bids[0].bid_amount
            : null,
          payment_deadline: winnerId ? paymentDeadline : null,
        }
      });

      // 2. Refund losers and update statuses
      for (const p of auction.auction_participants) {
        if (p.status === 'JOINED' || p.status === 'ACTIVE') {
          if (winnerId && p.user_id === winnerId) {
            // Winner: Create Order and deduct deposit automatically
            const wallet = await tx.wallets.findUnique({ where: { user_id: p.user_id } });
            if (wallet) {
              await tx.wallets.update({
                where: { wallet_id: wallet.wallet_id },
                data: {
                  balance_locked: { decrement: p.deposit_amount } // Fully deduct deposit
                }
              });

              await tx.wallet_transactions.create({
                data: {
                  wallet_id: wallet.wallet_id,
                  type_code: 'PAYMENT',
                  amount: -p.deposit_amount,
                  reference_code: `AUC_DEPOSIT_${auctionId}`,
                  description: `Deducted deposit for winning Auction #${auctionId}`
                }
              });
            }

            const paymentRefCode = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const orderCode = `AUC-${auctionId}-${Date.now()}`;
            const shippingFee = 30000;
            const remainingPayable = Number(updatedAuction.final_price) - Number(p.deposit_amount) + shippingFee;

            const userAddress = await tx.addresses.findFirst({
              where: { user_id: p.user_id, is_default: true, deleted_at: null }
            });

            await tx.orders.create({
              data: {
                user_id: p.user_id,
                order_code: orderCode,
                total_amount: Math.max(0, remainingPayable),
                paid_amount: p.deposit_amount,
                shipping_fee: shippingFee,
                original_shipping_fee: shippingFee,
                payment_ref_code: paymentRefCode,
                status_code: 'PENDING_PAYMENT',
                payment_deadline: paymentDeadline,
                channel_code: 'WEB',
                shipping_address_id: userAddress?.address_id || null, // Will ask user to update Address on Checkout page
                order_items: {
                  create: [
                    {
                      variant_id: auction.variant_id,
                      quantity: 1,
                      unit_price: Number(updatedAuction.final_price),
                      total_price: Number(updatedAuction.final_price)
                    }
                  ]
                },
                order_status_history: {
                  create: {
                    new_status: 'PENDING_PAYMENT',
                    note: 'Auction Winner Checkout Created'
                  }
                }
              }
            });

            await tx.product_variants.update({
              where: { variant_id: auction.variant_id },
              data: { stock_available: { decrement: 1 } } // Deduct stock
            });

            // Set WINNER status
            await tx.auction_participants.update({
              where: { auction_id_user_id: { auction_id: auctionId, user_id: p.user_id } },
              data: { status: 'WINNER' }
            });
          } else if (standbyId && p.user_id === standbyId) {
            // [Gap 3] Standby (Top 2): Refund deposit IMMEDIATELY
            // They just get a notification, no money kept. If top 1 forfeits, top 2 can buy.
            const standbyWallet = await tx.wallets.findUnique({ where: { user_id: p.user_id } });
            if (standbyWallet) {
              await tx.wallets.update({
                where: { wallet_id: standbyWallet.wallet_id },
                data: {
                  balance_available: { increment: p.deposit_amount },
                  balance_locked: { decrement: p.deposit_amount },
                }
              });
              await tx.wallet_transactions.create({
                data: {
                  wallet_id: standbyWallet.wallet_id,
                  type_code: 'DEPOSIT_UNLOCK',
                  amount: p.deposit_amount,
                  reference_code: `AUCTION_END_${auctionId}`,
                  description: `Refunded deposit: You are #2 in Auction #${auctionId}. Await notification if winner forfeits.`
                }
              });
            }
            await tx.auction_participants.update({
              where: { auction_id_user_id: { auction_id: auctionId, user_id: p.user_id } },
              data: { status: 'STANDBY_WINNER' }
            });
          } else {
            // Loser: Refund deposit
            const wallet = await tx.wallets.findUnique({ where: { user_id: p.user_id } });
            if (wallet) {
              await tx.wallets.update({
                where: { wallet_id: wallet.wallet_id },
                data: {
                  balance_available: { increment: p.deposit_amount },
                  balance_locked: { decrement: p.deposit_amount }
                }
              });

              await tx.wallet_transactions.create({
                data: {
                  wallet_id: wallet.wallet_id,
                  type_code: 'DEPOSIT_UNLOCK',
                  amount: p.deposit_amount,
                  reference_code: `AUCTION_END_${auctionId}`,
                  description: `Refunded deposit: Did not win Auction #${auctionId}`
                }
              });

              await tx.auction_participants.update({
                where: { auction_id_user_id: { auction_id: auctionId, user_id: p.user_id } },
                data: { status: 'REFUNDED' }
              });
            }
          }
        }
      }

      return {
        success: true,
        message: 'Auction ended successfully.',
        auction: updatedAuction,
        winnerId
      };
    });
  }

  async extendTime(auctionId: number, seconds: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'ACTIVE') {
      throw new BadRequestException('Can only extend time for ACTIVE auctions');
    }

    const newEndTime = new Date(auction.end_time.getTime() + seconds * 1000);

    const updatedAuction = await this.prisma.auctions.update({
      where: { auction_id: auctionId },
      data: { end_time: newEndTime },
    });

    // Notify all participants about the time extension via Socket.io
    this.auctionsGateway.server.to(`auction_${auctionId}`).emit('end_time_extended', {
      auctionId,
      newEndTime,
      message: `Auction time has been extended by ${seconds} seconds!`,
    });

    return {
      success: true,
      message: `Auction time extended by ${seconds} seconds`,
      newEndTime,
    };
  }

  async checkExpiredAuctions() {
    const expiredAuctions = await this.prisma.auctions.findMany({
      where: {
        status_code: 'ACTIVE',
        end_time: { lte: new Date() }
      }
    });

    for (const auction of expiredAuctions) {
      this.logger.log(`Auction #${auction.auction_id} has expired. Triggering automated closure...`);
      try {
        await this.endAuction(auction.auction_id);
        this.logger.log(`Auction #${auction.auction_id} closed successfully.`);
      } catch (error) {
        this.logger.error(`Failed to close Auction #${auction.auction_id}:`, error);
      }
    }
  }

  async forfeitWinner(auctionId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: {
          include: { users: { select: { user_id: true, full_name: true } } }
        },
        auction_bids: { orderBy: { bid_amount: 'desc' } },
        product_variants: { include: { products: true } }
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('Can only forfeit an auction in AWAITING_PAYMENT state');
    }

    return this.prisma.$transaction(async (tx) => {
      const winner = auction.auction_participants.find(p => p.status === 'WINNER');
      if (!winner) {
        throw new BadRequestException('No active winner found for this auction');
      }

      // 1. Slash (confiscate) Top 1 deposit - PENALTY
      const winnerWallet = await tx.wallets.findUnique({ where: { user_id: winner.user_id } });
      if (winnerWallet) {
        await tx.wallets.update({
          where: { wallet_id: winnerWallet.wallet_id },
          data: { balance_locked: { decrement: winner.deposit_amount } }
        });
        await tx.wallet_transactions.create({
          data: {
            wallet_id: winnerWallet.wallet_id,
            type_code: 'PENALTY_FORFEIT',
            amount: -winner.deposit_amount,
            reference_code: `FORFEIT_${auctionId}`,
            description: `Deposit confiscated: failed to pay within deadline for Auction #${auctionId}`
          }
        });
      }

      // 1.5 Update / Cancel previous Top 1 Order
      const winnerOrder = await tx.orders.findFirst({
        where: { order_code: { startsWith: `AUC-${auctionId}-` }, user_id: winner.user_id, status_code: 'PENDING_PAYMENT' }
      });
      if (winnerOrder) {
        await tx.orders.update({
          where: { order_id: winnerOrder.order_id },
          data: { status_code: 'CANCELLED' }
        });
        // Restore product stock
        await tx.product_variants.update({
          where: { variant_id: auction.variant_id },
          data: { stock_available: { increment: 1 } }
        });
      }

      // 2. Mark Top 1 as FORFEITED
      await tx.auction_participants.update({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: winner.user_id } },
        data: { status: 'FORFEITED' }
      });

      // 3. Find Top 2 (STANDBY_WINNER) and create a new order for them
      const standby = auction.auction_participants.find(p => p.status === 'STANDBY_WINNER');
      let newWinnerId: number | null = null;
      const productName = auction.product_variants?.products?.name || `Product #${auction.variant_id}`;
      const newPaymentDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

      if (standby) {
        // Find the highest bid from standby (their own bid price)
        const standbyTopBid = auction.auction_bids.find(b => b.user_id === standby.user_id);
        const standbyPrice = standbyTopBid ? Number(standbyTopBid.bid_amount) : 0;

        // Promote standby to WINNER
        await tx.auction_participants.update({
          where: { auction_id_user_id: { auction_id: auctionId, user_id: standby.user_id } },
          data: { status: 'WINNER' }
        });
        newWinnerId = standby.user_id;

        // Auto-create Order for Standby (No deposit subtracted because it was refunded)
        const paymentRefCode = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const orderCode = `AUC-${auctionId}-${Date.now()}`;
        const shippingFee = 30000;
        const remainingPayable = standbyPrice + shippingFee;

        const userAddress = await tx.addresses.findFirst({
          where: { user_id: standby.user_id, is_default: true, deleted_at: null }
        });

        await tx.orders.create({
          data: {
            user_id: standby.user_id,
            order_code: orderCode,
            total_amount: Math.max(0, remainingPayable),
            paid_amount: 0,
            shipping_fee: shippingFee,
            original_shipping_fee: shippingFee,
            payment_ref_code: paymentRefCode,
            status_code: 'PENDING_PAYMENT',
            payment_deadline: newPaymentDeadline,
            channel_code: 'WEB',
            shipping_address_id: userAddress?.address_id || null,
            order_items: {
              create: [
                {
                  variant_id: auction.variant_id,
                  quantity: 1,
                  unit_price: standbyPrice,
                  total_price: standbyPrice
                }
              ]
            },
            order_status_history: {
              create: {
                new_status: 'PENDING_PAYMENT',
                note: 'Auction Standby Checkout Created'
              }
            }
          }
        });

        // Restore stock for standby order
        await tx.product_variants.update({
          where: { variant_id: auction.variant_id },
          data: { stock_available: { decrement: 1 } }
        });

        // Notify Top 2 with their own bid price
        const paymentLink = `${process.env.FRONTEND_URL || 'https://figicore.com'}/customer/cart`;
        
        await this.mailService.sendAuctionStandbyWinEmail(
          standby.users,
          auctionId,
          productName,
          paymentLink,
          Number(remainingPayable)
        );

        await this.notificationsService.create(
          standby.user_id,
          `Purchase Opportunity: ${productName}!`,
          `The previous auction winner failed to pay within the deadline. An order has been auto-created for you at your highest bid price of ${standbyPrice.toLocaleString('en-US')} VND. You have 24 hours to complete payment or cancel the order.`
        );
      }

      // 4. Update auction - continue with AWAITING_PAYMENT if standby exists, otherwise FAILED_NO_BUYER
      const updatedAuction = await tx.auctions.update({
        where: { auction_id: auctionId },
        data: {
          winner_id: newWinnerId,
          status_code: newWinnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER',
          payment_deadline: newWinnerId ? newPaymentDeadline : null,
        }
      });

      return {
        success: true,
        message: standby
          ? `Top 1 forfeited. Top 2 notified to purchase at their bid price.`
          : 'Top 1 forfeited. No standby available, auction concluded.',
        auction: updatedAuction,
        newWinnerId
      };
    });
  }

  // Called from OrdersService when Winner actively cancels their order
  async manualForfeitAuction(auctionId: number, userId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: {
          include: { users: { select: { user_id: true, full_name: true } } }
        },
        auction_bids: { orderBy: { bid_amount: 'desc' } },
        product_variants: { include: { products: true } }
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('Auction is not AWAITING_PAYMENT');
    }

    return this.prisma.$transaction(async (tx) => {
      const winner = auction.auction_participants.find(p => p.user_id === userId && p.status === 'WINNER');
      if (!winner) {
        throw new BadRequestException('User is not the active winner of this auction');
      }

      // 1. Confiscate deposit (PENALTY_FORFEIT)
      const winnerWallet = await tx.wallets.findUnique({ where: { user_id: winner.user_id } });
      if (winnerWallet) {
        // Deduct from locked balance
        await tx.wallets.update({
          where: { wallet_id: winnerWallet.wallet_id },
          data: { balance_locked: { decrement: winner.deposit_amount } }
        });
        await tx.wallet_transactions.create({
          data: {
            wallet_id: winnerWallet.wallet_id,
            type_code: 'PENALTY_FORFEIT',
            amount: -winner.deposit_amount,
            reference_code: `FORFEIT_${auctionId}_MANUAL`,
            description: `Deposit forfeited due to payment cancellation for Auction #${auctionId}`
          }
        });
      }

      // Top 1 Order already marked CANCELLED in OrdersService

      // 2. Mark Top 1 as FORFEITED
      await tx.auction_participants.update({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: winner.user_id } },
        data: { status: 'FORFEITED' }
      });

      // 3. Promote Top 2 (Standby)
      const standby = auction.auction_participants.find(p => p.status === 'STANDBY_WINNER');
      let newWinnerId: number | null = null;
      const productName = auction.product_variants?.products?.name || `Product #${auction.variant_id}`;
      const newPaymentDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

      if (standby) {
        const standbyTopBid = auction.auction_bids.find(b => b.user_id === standby.user_id);
        const standbyPrice = standbyTopBid ? Number(standbyTopBid.bid_amount) : 0;

        await tx.auction_participants.update({
          where: { auction_id_user_id: { auction_id: auctionId, user_id: standby.user_id } },
          data: { status: 'WINNER' }
        });
        newWinnerId = standby.user_id;

        const paymentRefCode = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const orderCode = `AUC-${auctionId}-${Date.now()}`;
        const shippingFee = 30000;
        const remainingPayable = standbyPrice + shippingFee;

        const userAddress = await tx.addresses.findFirst({
          where: { user_id: standby.user_id, is_default: true, deleted_at: null }
        });

        await tx.orders.create({
          data: {
            user_id: standby.user_id,
            order_code: orderCode,
            total_amount: Math.max(0, remainingPayable),
            paid_amount: 0,
            shipping_fee: shippingFee,
            original_shipping_fee: shippingFee,
            payment_ref_code: paymentRefCode,
            status_code: 'PENDING_PAYMENT',
            payment_deadline: newPaymentDeadline,
            channel_code: 'WEB',
            shipping_address_id: userAddress?.address_id || null,
            order_items: {
              create: [{
                variant_id: auction.variant_id,
                quantity: 1,
                unit_price: standbyPrice,
                total_price: standbyPrice
              }]
            },
            order_status_history: {
              create: {
                new_status: 'PENDING_PAYMENT',
                note: 'Auction Standby Checkout Created (Top 1 Cancelled)'
              }
            }
          }
        });

        // Notifications
        const paymentLink = `${process.env.FRONTEND_URL || 'https://figicore.com'}/customer/cart`;
        
        await this.mailService.sendAuctionStandbyWinEmail(
          standby.users,
          auctionId,
          productName,
          paymentLink,
          Number(remainingPayable)
        );

        await this.notificationsService.create(
          standby.user_id,
          `Purchase Opportunity: ${productName}!`,
          `The previous auction winner has cancelled their order. An order has been auto-created for you at your highest bid price of ${standbyPrice.toLocaleString('en-US')} VND. You have 24 hours to complete payment or cancel the order.`
        );
      }

      await tx.auctions.update({
        where: { auction_id: auctionId },
        data: {
          winner_id: newWinnerId,
          status_code: newWinnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER',
          payment_deadline: newWinnerId ? newPaymentDeadline : null,
        }
      });

      // Emit socket event to room
      const roomName = `auction_${auctionId}`;
      this.auctionsGateway.server.to(roomName).emit('winner_forfeited', {
        auctionId: auctionId,
        newWinnerId: newWinnerId,
        status: newWinnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER'
      });

      return {
        success: true,
        newWinnerId,
      };
    });
  }

  // [Gap 6] Top 2 declines purchase after promotion
  async declineByStandby(auctionId: number, userId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: { where: { user_id: userId } },
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('Auction is not awaiting payment');
    }

    const participant = auction.auction_participants[0];
    if (!participant || participant.status !== 'WINNER') {
      throw new BadRequestException('You are not the invited buyer or have already declined');
    }

    // Top 2 declined: they were already refunded during endAuction
    return this.prisma.$transaction(async (tx) => {
      await tx.auction_participants.update({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: userId } },
        data: { status: 'DECLINED' }
      });

      // 1.5 Update / Cancel Order created for Top 2
      const standbyOrder = await tx.orders.findFirst({
        where: { order_code: { startsWith: `AUC-${auctionId}-` }, user_id: userId, status_code: 'PENDING_PAYMENT' }
      });
      if (standbyOrder) {
        await tx.orders.update({
          where: { order_id: standbyOrder.order_id },
          data: { status_code: 'CANCELLED' }
        });
        // Restock inventory
        await tx.product_variants.update({
          where: { variant_id: auction.variant_id },
          data: { stock_available: { increment: 1 } }
        });
      }

      // Auction concluded - no buyer secured
      const updatedAuction = await tx.auctions.update({
        where: { auction_id: auctionId },
        data: {
          status_code: 'FAILED_NO_BUYER',
          winner_id: null,
          payment_deadline: null
        }
      });

      return {
        success: true,
        message: 'You have declined. The auction is concluded.',
        auction: updatedAuction
      };
    });
  }

  async kickParticipant(auctionId: number, userId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status_code === 'COMPLETED') {
      throw new BadRequestException('Cannot kick user from a completed auction');
    }

    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.auction_participants.findUnique({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: userId } }
      });

      if (!participant || (participant.status !== 'JOINED' && participant.status !== 'ACTIVE')) {
        throw new BadRequestException('User is not an active participant in this auction');
      }

      const wallet = await tx.wallets.findUnique({ where: { user_id: userId } });
      if (wallet) {
        await tx.wallets.update({
          where: { wallet_id: wallet.wallet_id },
          data: {
            balance_available: { increment: participant.deposit_amount },
            balance_locked: { decrement: participant.deposit_amount }
          }
        });

        await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.wallet_id,
            type_code: 'DEPOSIT_UNLOCK',
            amount: participant.deposit_amount,
            reference_code: `KICK_${auctionId}_${userId}`,
            description: `Refunded deposit: Kicked from Auction #${auctionId}`
          }
        });
      }

      await tx.auction_participants.update({
        where: { auction_id_user_id: { auction_id: auctionId, user_id: userId } },
        data: { status: 'BANNED' }
      });

      return { success: true, message: 'User kicked out and deposit refunded.' };
    });
  }

  async cancelResult(auctionId: number) {
    const auction = await this.prisma.auctions.findUnique({
      where: { auction_id: auctionId },
      include: {
        auction_participants: true
      }
    });

    if (!auction) throw new NotFoundException('Auction not found');

    return this.prisma.$transaction(async (tx) => {
      // Find anyone holding a locked deposit (WINNER, STANDBY_WINNER) or ACTIVE
      const unrefunded = auction.auction_participants.filter(p => ['WINNER', 'STANDBY_WINNER', 'JOINED', 'ACTIVE'].includes(p.status));

      for (const p of unrefunded) {
        const wallet = await tx.wallets.findUnique({ where: { user_id: p.user_id } });
        if (wallet) {
          await tx.wallets.update({
            where: { wallet_id: wallet.wallet_id },
            data: {
              balance_available: { increment: p.deposit_amount },
              balance_locked: { decrement: p.deposit_amount }
            }
          });

          await tx.wallet_transactions.create({
            data: {
              wallet_id: wallet.wallet_id,
              type_code: 'DEPOSIT_UNLOCK',
              amount: p.deposit_amount,
              reference_code: `CANCEL_AUC_${auctionId}_${p.user_id}`,
              description: `Refunded deposit: Auction #${auctionId} was cancelled`
            }
          });
        }
      }

      // Instead of CANCELED, just reset to DRAFT so admin can rethink 
      const updatedAuction = await tx.auctions.update({
        where: { auction_id: auctionId },
        data: {
          status_code: 'DRAFT',
          winner_id: null
        }
      });

      return {
        success: true,
        message: 'Auction cancelled. All active deposits refunded and status reset to DRAFT.',
        auction: updatedAuction
      };
    });
  }

  async saveChatMessage(auctionId: number, userId: number, message: string) {
    return this.prisma.auction_chat_messages.create({
      data: {
        auction_id: auctionId,
        user_id: userId,
        message: message
      },
      include: {
        users: {
          select: {
            full_name: true
          }
        }
      }
    });
  }

  async getChatHistory(auctionId: number) {
    return this.prisma.auction_chat_messages.findMany({
      where: {
        auction_id: auctionId
      },
      include: {
        users: {
          select: {
            full_name: true
          }
        }
      },
      orderBy: {
        created_at: 'asc'
      },
      take: 100 // Limit history to last 100 messages
    });
  }
}
