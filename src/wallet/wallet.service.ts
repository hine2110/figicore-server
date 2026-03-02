import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    constructor(private prisma: PrismaService) { }

    async getMyWallet(userId: number) {
        let wallet = await this.prisma.wallets.findUnique({
            where: { user_id: userId },
            include: {
                wallet_transactions: {
                    orderBy: { created_at: 'desc' }
                }
            }
        });

        if (!wallet) {
            // Auto-create wallet if not exists
            wallet = await this.prisma.wallets.create({
                data: { user_id: userId, balance_available: 0, balance_locked: 0 },
                include: {
                    wallet_transactions: true // Empty initially, but matches return type
                }
            });
        }

        return wallet;
    }

    // Helper for Order Service to use
    async deductBalance(userId: number, amount: number, refCode: string, description: string) {
        return this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallets.findUnique({ where: { user_id: userId } });
            if (!wallet) throw new BadRequestException("Wallet not found");

            if (Number(wallet.balance_available) < amount) {
                throw new BadRequestException("Insufficient wallet balance");
            }

            const updatedWallet = await tx.wallets.update({
                where: { wallet_id: wallet.wallet_id },
                data: {
                    balance_available: { decrement: amount }
                }
            });

            await tx.wallet_transactions.create({
                data: {
                    wallet_id: wallet.wallet_id,
                    type_code: 'PAYMENT',
                    amount: -amount,
                    reference_code: refCode,
                    description: description
                }
            });

            return updatedWallet;
        });
    }

    async createTopUpRequest(userId: number, amount: number) {
        // Generate a unique reference code: TU[userId]V[timestamp]
        // Example: TU5V1772080106
        const timestamp = Date.now().toString().slice(-10); // use just last 10 digits to keep QR content short
        const refCode = `TU${userId}V${timestamp}`;

        // Return the code so the frontend can generate the VietQR image
        return {
            paymentRefCode: refCode,
            amount: amount,
            message: 'Use this reference code in your VietQR transfer content'
        };
    }
}
