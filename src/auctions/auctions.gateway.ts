import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { UseGuards, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionsService } from './auctions.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: '/auction-live',
})
export class AuctionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(AuctionsGateway.name);

    // Anti-Spam and Race Condition protection
    private bidLocks: Map<number, boolean> = new Map(); // Lock room during bid processing
    private userLastBidTime: Map<string, number> = new Map(); // Store user's last bid time {auctionId_userId}

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => AuctionsService)) private auctionsService: AuctionsService
    ) { }

    async handleConnection(client: Socket) {
        console.log(`Client connected to auction namespace: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected from auction namespace: ${client.id}`);
    }

    @SubscribeMessage('join_room')
    async handleJoinRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; userId: number },
    ) {
        const roomName = `auction_${payload.auctionId}`;
        client.join(roomName);
        console.log(`User ${payload.userId} joined room ${roomName}`);

        // Optionally: Broadcast to the room that a user entered
        // this.server.to(roomName).emit('user_joined', { userId: payload.userId });

        // Send back current state
        const auction = await this.prisma.auctions.findUnique({
            where: { auction_id: payload.auctionId },
            include: { auction_bids: { orderBy: { created_at: 'desc' }, take: 1 } }
        });

        if (auction) {
            const currentPrice = auction.auction_bids.length > 0
                ? Number(auction.auction_bids[0].bid_amount)
                : Number(auction.start_price);

            client.emit('room_state', {
                auctionId: auction.auction_id,
                currentPrice,
                status: auction.status_code,
                endTime: auction.end_time
            });

            // Send chat history
            const history = await this.auctionsService.getChatHistory(payload.auctionId);
            client.emit('chat_history', history.map(h => ({
                id: h.message_id,
                userId: h.user_id,
                name: h.users?.full_name || 'Anonymous',
                text: h.message,
                timestamp: h.created_at
            })));
        }
    }

    @SubscribeMessage('place_bid')
    async handlePlaceBid(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; userId: number; bidAmount: number },
    ) {
        const lockKey = payload.auctionId;
        const userRateKey = `${payload.auctionId}_${payload.userId}`;

        // 0A. Rate Limiting: 1 user can only bid once per second per room
        const lastBidTime = this.userLastBidTime.get(userRateKey);
        if (lastBidTime && Date.now() - lastBidTime < 1000) {
            client.emit('bid_error', { message: 'Slow down! You are bidding too fast.' });
            return;
        }

        // 0B. Local Mutex Lock to prevent Race Conditions
        if (this.bidLocks.get(lockKey)) {
            client.emit('bid_error', { message: 'Another bid is being processed. Please try again.' });
            return;
        }

        this.bidLocks.set(lockKey, true);
        this.userLastBidTime.set(userRateKey, Date.now());

        try {
            // 1. Validate Auction is Active
            const auction = await this.prisma.auctions.findUnique({
                where: { auction_id: payload.auctionId },
                include: { auction_bids: { orderBy: { created_at: 'desc' }, take: 1 } }
            });

            if (!auction || auction.status_code !== 'ACTIVE') {
                client.emit('bid_error', { message: 'Auction is not currently active.' });
                return;
            }

            // 2. Validate participant is authorized (has locked deposit)
            const participant = await this.prisma.auction_participants.findUnique({
                where: { auction_id_user_id: { auction_id: payload.auctionId, user_id: payload.userId } }
            });

            if (!participant || (participant.status !== 'ACTIVE' && participant.status !== 'JOINED')) {
                client.emit('bid_error', { message: 'You must lock a deposit to bid' });
                return;
            }

            // 3. Validate Bid Amount (Must be greater than highest bid + step)
            const currentHighest = auction.auction_bids.length > 0
                ? Number(auction.auction_bids[0].bid_amount)
                : Number(auction.start_price);

            if (payload.bidAmount < currentHighest + Number(auction.step_price)) {
                client.emit('bid_error', { message: `Bid must be at least ${currentHighest + Number(auction.step_price)}` });
                return;
            }

            // 4. Save Bid
            const newBid = await this.prisma.auction_bids.create({
                data: {
                    auction_id: payload.auctionId,
                    user_id: payload.userId,
                    bid_amount: payload.bidAmount
                },
                include: {
                    users: { select: { full_name: true } }
                }
            });

            // 5. Broadcast new bid to all clients in the room
            const roomName = `auction_${payload.auctionId}`;
            this.server.to(roomName).emit('new_bid', {
                bidId: newBid.bid_id,
                auctionId: newBid.auction_id,
                userId: newBid.user_id,
                bidAmount: Number(newBid.bid_amount),
                bidTime: newBid.created_at,
                bidderName: newBid.users?.full_name || `User ***${String(newBid.user_id).slice(-2)}`
            });

            // [Gap 11] Anti-Snipe: if bid in last 60s -> extend +60s
            const now = new Date();
            const secondsLeft = (new Date(auction.end_time).getTime() - now.getTime()) / 1000;
            if (secondsLeft <= 60 && secondsLeft > 0) {
                const newEndTime = new Date(now.getTime() + 60 * 1000);
                await this.prisma.auctions.update({
                    where: { auction_id: payload.auctionId },
                    data: { end_time: newEndTime }
                });
                this.server.to(roomName).emit('end_time_extended', {
                    auctionId: payload.auctionId,
                    newEndTime: newEndTime.toISOString(),
                    reason: 'Anti-snipe: bid placed in final 60s'
                });
                this.logger.log(`Anti-snipe triggered for Auction #${payload.auctionId}. New end time: ${newEndTime}`);
            }

        } catch (error: any) {
            console.error('Bid Error:', error);
            client.emit('bid_error', { message: 'System error processing bid. Please try again.' });
        } finally {
            // Release lock after processing (or error)
            this.bidLocks.delete(lockKey);
        }
    }

    @SubscribeMessage('send_announcement')
    handleSendAnnouncement(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; message: string; type?: string },
    ) {
        // Broadcast the announcement to everyone in the room
        const roomName = `auction_${payload.auctionId}`;
        this.server.to(roomName).emit('auction_announcement', {
            message: payload.message,
            type: payload.type || 'info', // e.g., 'warning', 'urgent'
            timestamp: new Date()
        });
    }

    @SubscribeMessage('send_emoji')
    handleSendEmoji(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; emoji: string },
    ) {
        // Broadcast the emoji to everyone in the room (including sender to trigger animation)
        const roomName = `auction_${payload.auctionId}`;
        this.server.to(roomName).emit('room_emoji', {
            emoji: payload.emoji,
            timestamp: new Date()
        });
    }

    @SubscribeMessage('send_reaction')
    handleSendReaction(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; symbol: string },
    ) {
        // Broadcast the flying reaction to everyone in the room
        const roomName = `auction_${payload.auctionId}`;
        this.server.to(roomName).emit('reaction_received', {
            symbol: payload.symbol,
            timestamp: new Date()
        });
    }

    @Cron(CronExpression.EVERY_10_SECONDS)
    async checkUpcomingAuctions() {
        const upcomingAuctions = await this.prisma.auctions.findMany({
            where: {
                status_code: 'UPCOMING',
                start_time: { lte: new Date() }
            }
        });

        for (const auction of upcomingAuctions) {
            this.logger.log(`Auction #${auction.auction_id} Start Time Reached. Activating...`);
            try {
                await this.prisma.auctions.update({
                    where: { auction_id: auction.auction_id },
                    data: { status_code: 'ACTIVE' }
                });

                // Broadcast activation to all clients in the room
                const roomName = `auction_${auction.auction_id}`;
                this.server.to(roomName).emit('room_state', {
                    auctionId: auction.auction_id,
                    status: 'ACTIVE'
                });

                this.logger.log(`Auction #${auction.auction_id} is now LIVE.`);
            } catch (error) {
                this.logger.error(`Failed to activate Auction #${auction.auction_id}:`, error);
            }
        }
    }

    @Cron(CronExpression.EVERY_10_SECONDS)
    async checkExpiredAuctions() {
        const expiredAuctions = await this.prisma.auctions.findMany({
            where: {
                status_code: 'ACTIVE',
                end_time: { lte: new Date() }
            }
        });

        for (const auction of expiredAuctions) {
            this.logger.log(`Auction #${auction.auction_id} Timer Expired. Auto-closing...`);
            try {
                // Determine winner and handle refunds/transactions
                const result = await this.auctionsService.endAuction(auction.auction_id);

                // Broadcast closure to all clients in the room
                const roomName = `auction_${auction.auction_id}`;
                this.server.to(roomName).emit('auction_ended', {
                    auctionId: auction.auction_id,
                    winnerId: result.winnerId
                });
                this.server.to(roomName).emit('room_state', {
                    auctionId: auction.auction_id,
                    status: result.winnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER'
                });

                this.logger.log(`Auction #${auction.auction_id} closed and clients notified.`);
            } catch (error) {
                this.logger.error(`Failed to close Auction #${auction.auction_id}:`, error);
            }
        }
    }

    // [Gap 10] Auto-forfeit after payment_deadline expires
    @Cron('0 */5 * * * *') // Every 5 minutes
    async checkPaymentDeadlines() {
        const overdueAuctions = await this.prisma.auctions.findMany({
            where: {
                status_code: 'AWAITING_PAYMENT',
                payment_deadline: { lte: new Date() }
            }
        });

        for (const auction of overdueAuctions) {
            this.logger.log(`Auction #${auction.auction_id} payment deadline EXPIRED. Auto-forfeiting winner...`);
            try {
                const result = await this.auctionsService.forfeitWinner(auction.auction_id);
                const roomName = `auction_${auction.auction_id}`;
                this.server.to(roomName).emit('winner_forfeited', {
                    auctionId: auction.auction_id,
                    newWinnerId: result.newWinnerId,
                    status: result.newWinnerId ? 'AWAITING_PAYMENT' : 'FAILED_NO_BUYER'
                });
                this.logger.log(`Auction #${auction.auction_id} auto-forfeit completed.`);
            } catch (error) {
                this.logger.error(`Auto-forfeit failed for Auction #${auction.auction_id}:`, error);
            }
        }
    }

    // Real-time Chat: broadcast message to all participants in the auction room
    @SubscribeMessage('send_chat')
    async handleSendChat(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number; userId: number; name: string; text: string },
    ) {
        if (!payload.text?.trim() || !payload.auctionId) return;

        // [Total Lockdown Check]
        const auction = await this.auctionsService.findOne(payload.auctionId);
        if (!auction || ['COMPLETED', 'FAILED_NO_BUYER', 'CANCELLED'].includes(auction.status_code)) {
            client.emit('error', { message: 'Chat is disabled for this archived session.' });
            return;
        }

        const roomName = `auction_${payload.auctionId}`;
        
        // Save to DB first
        const savedMsg = await this.auctionsService.saveChatMessage(
            payload.auctionId,
            payload.userId,
            payload.text.trim()
        );

        // Broadcast to everyone in the room including the sender (for cross-tab consistency)
        this.server.to(roomName).emit('chat_message', {
            messageId: savedMsg.message_id,
            userId: payload.userId,
            name: savedMsg.users?.full_name || 'Anonymous',
            text: savedMsg.message,
            timestamp: savedMsg.created_at
        });
    }

    @SubscribeMessage('close_auction_room')
    async handleCloseAuctionRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { auctionId: number },
    ) {
        const roomName = `auction_${payload.auctionId}`;
        this.logger.log(`Admin requested to close room: ${roomName}`);
        
        // 1. Update DB state permanently
        await this.auctionsService.closeRoom(payload.auctionId);

        // 2. Broadcast closure signal to all clients
        this.server.to(roomName).emit('room_closed', { message: 'The auction session has been ended by the Admin.' });
    }
}
