import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { LivestreamsService } from './livestreams.service';
import { OrdersService } from '../orders/orders.service';
import { GiveawaysService } from './giveaways.service';
import { CartService } from '../cart/cart.service';

@WebSocketGateway({
  cors: {
    origin: ['https://figicore.com', 'https://api.figicore.com', 'http://localhost:5173'],
    credentials: true
  },
  namespace: '/livestream-live',
})
export class LivestreamLiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly livestreamsService: LivestreamsService,
    private readonly giveawaysService: GiveawaysService,
    @Inject(forwardRef(() => OrdersService)) private readonly ordersService: OrdersService,
    private readonly cartService: CartService,
  ) { }

  private roomParticipants: Map<string, Map<string, { userId?: number; isHost: boolean }>> = new Map();
  private roomChatHistory: Map<string, any[]> = new Map();
  private giveawayStates: Map<string, {
    id: number;
    keyword: string;
    slots: number;
    participants: Map<number, string>;
    isActive: boolean;
    variantId: number;
    endTime?: string;
  }> = new Map();

  handleConnection(client: Socket) {
    console.log(`Client connected to livestream: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Socket] Client disconnected: ${client.id}`);
    this.cleanupClient(client.id);
  }

  private cleanupClient(clientId: string) {
    this.roomParticipants.forEach((participants, roomId) => {
      if (participants.has(clientId)) {
        participants.delete(clientId);
        this.broadcastViewerCount(roomId);
      }
    });
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(client: Socket, payload: { roomId: string; userId?: number; isHost?: boolean }) {
    const { roomId, userId, isHost } = payload;

    // Safety: cleanup client from any other room tracking before adding to new one
    this.cleanupClient(client.id);

    client.join(roomId);

    if (!this.roomParticipants.has(roomId)) {
      this.roomParticipants.set(roomId, new Map());
    }

    this.roomParticipants.get(roomId)?.set(client.id, { userId, isHost: !!isHost });
    this.broadcastViewerCount(roomId);

    // Send chat history
    const history = this.roomChatHistory.get(roomId) || [];
    client.emit('chat_history', history);

    // --- GIVEAWAY RECOVERY ---
    const giveaway = this.giveawayStates.get(roomId);
    if (giveaway && giveaway.isActive) {
      client.emit('giveaway_started', {
        id: giveaway.id,
        keyword: giveaway.keyword,
        slots: giveaway.slots,
        current_entries: giveaway.participants.size,
        status: 'ACTIVE',
        end_time: giveaway.endTime
      });
    }

    console.log(`[Socket] Room ${roomId}: Client ${client.id} joined (IsHost: ${!!isHost}, UserID: ${userId})`);
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(client: Socket, payload: { roomId: string }) {
    const roomId = payload.roomId;
    client.leave(roomId);

    if (this.roomParticipants.has(roomId)) {
      this.roomParticipants.get(roomId)?.delete(client.id);
      this.broadcastViewerCount(roomId);
    }
  }

  private broadcastViewerCount(roomId: string) {
    const participants = this.roomParticipants.get(roomId);
    if (!participants) return;

    const uniqueViewers = new Set<string>();
    participants.forEach((info, clientId) => {
      // Exclude hosts from the viewer count
      if (!info.isHost) {
        if (info.userId) {
          // Deduplicate logged-in users by their ID
          uniqueViewers.add(`u:${info.userId}`);
        } else {
          // Guests are identified by their unique socket ID
          uniqueViewers.add(`c:${clientId}`);
        }
      }
    });

    const count = uniqueViewers.size;
    this.server.to(roomId).emit('viewer_update', { count });
    console.log(`Room ${roomId} viewer count updated: ${count}`);
  }

  @SubscribeMessage('send_chat')
  handleSendChat(client: any, payload: { roomId: string; userId?: number; name: string; text: string; rank?: string }) {
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      user_id: payload.userId,
      userId: payload.userId,
      name: payload.name,
      text: payload.text,
      rank: payload.rank || 'BRONZE',
      timestamp: new Date().toISOString(),
    };

    if (!this.roomChatHistory.has(payload.roomId)) {
      this.roomChatHistory.set(payload.roomId, []);
    }
    const history = this.roomChatHistory.get(payload.roomId)!;
    history.push(msg);
    if (history.length > 200) history.shift();

    // --- GIVEAWAY HOOK ---
    const state = this.giveawayStates.get(payload.roomId);
    if (state && state.isActive && payload.userId) {
      if (payload.text.trim() === state.keyword) { // Exact Case-Sensitive Match
        if (!state.participants.has(payload.userId) && state.participants.size < state.slots) {
          state.participants.set(payload.userId, payload.name || 'User');
          this.server.to(payload.roomId).emit('giveaway_entry_count', { count: state.participants.size });
        }
      }
    }
    // ---------------------

    this.server.to(payload.roomId).emit('chat_message', msg);
  }

  @SubscribeMessage('refresh_products')
  handleRefreshProducts(client: any, payload: { roomId: string; livestreamId: number }) {
    this.server.to(payload.roomId).emit('products_updated');
  }

  @SubscribeMessage('send_heart')
  @UseGuards(WsJwtGuard)
  async handleSendHeart(client: any, payload: { roomId: string; livestreamId: number }) {
    await this.livestreamsService.recordInteraction(payload.livestreamId, 'HEART', client.user.user_id);
    this.server.to(payload.roomId).emit('new_heart', {
      user_id: client.user.user_id,
      user_name: client.user.full_name,
    });
  }

  // Admin Events

  @SubscribeMessage('trigger_flash_sale')
  @UseGuards(WsJwtGuard)
  async handleFlashSale(client: any, payload: {
    roomId: string;
    livestreamId: number;
    variantId: number;
    price: number;
    stock: number;
    durationSeconds?: number;
  }) {
    const duration = payload.durationSeconds || 300; // Default 5 mins
    const endTime = new Date(Date.now() + duration * 1000).toISOString();

    await this.livestreamsService.triggerFlashSale(payload.livestreamId, payload.variantId, payload.price, payload.stock);

    this.server.to(payload.roomId).emit('flash_sale_started', {
      variant_id: payload.variantId,
      price: payload.price,
      stock: payload.stock,
      end_time: endTime,
    });

    // Auto-revert flash sale when time is up
    setTimeout(async () => {
      try {
        await this.livestreamsService.triggerFlashSale(payload.livestreamId, payload.variantId, 0, 0);
        this.server.to(payload.roomId).emit('flash_sale_ended', {
          variant_id: payload.variantId
        });
        // Signal clients to refresh prices
        this.broadcastProductUpdate(payload.roomId, payload.variantId);
        console.log(`[Socket] Auto-reverted flash sale for variant ${payload.variantId} in room ${payload.roomId} after ${duration}s`);
      } catch (err) {
        console.error(`Failed to auto-revert flash sale:`, err);
      }
    }, duration * 1000);
  }

  @SubscribeMessage('pin_product')
  @UseGuards(WsJwtGuard)
  async handlePinProduct(client: any, payload: { roomId: string; livestreamId: number; variantId: number }) {
    // Database update relies on the REST API call from admin, or we can do it here.
    // The Admin UI already calls API, so this just acts as a broadcast.
    this.server.to(payload.roomId).emit('product_pinned', { variant_id: payload.variantId });
  }

  @SubscribeMessage('focus_product')
  @UseGuards(WsJwtGuard)
  async handleFocusProduct(client: any, payload: { roomId: string; livestreamId: number; variantId: number }) {
    // Optionally update DB to track current focus
    await this.livestreamsService.pinProduct(payload.livestreamId, payload.variantId);
    this.server.to(payload.roomId).emit('product_focused', { variant_id: payload.variantId });
  }

  @SubscribeMessage('unfocus_product')
  @UseGuards(WsJwtGuard)
  async handleUnfocusProduct(client: any, payload: { roomId: string; livestreamId: number }) {
    await this.livestreamsService.pinProduct(payload.livestreamId, 0); // Clear pin
    this.server.to(payload.roomId).emit('product_unfocused');
  }

  @SubscribeMessage('pin_comment')
  @UseGuards(WsJwtGuard)
  handlePinComment(client: any, payload: { roomId: string; messageId: number; content: string; name: string }) {
    this.server.to(payload.roomId).emit('comment_pinned', {
      message_id: payload.messageId,
      content: payload.content,
      name: payload.name
    });
  }

  @SubscribeMessage('kick_user')
  @UseGuards(WsJwtGuard)
  handleKickUser(client: any, payload: { roomId: string; userId: number; userName: string }) {
    // Broadcast a "you are kicked" event to the specific user's socket (or room-wide with user check)
    this.server.to(payload.roomId).emit('user_kicked', {
      user_id: payload.userId,
      user_name: payload.userName
    });
    console.log(`User ${payload.userName} kicked from room ${payload.roomId}`);
  }

  @SubscribeMessage('admin_broadcast')
  @UseGuards(WsJwtGuard)
  async handleAdminBroadcast(client: any, payload: { roomId: string; livestreamId: number; content: string }) {
    await this.livestreamsService.addBroadcastMessage(payload.livestreamId, payload.content);
    this.server.to(payload.roomId).emit('broadcast_notification', {
      content: payload.content,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastOrder(roomId: string, order: {
    order_id?: number | string;
    status?: string;
    customer_name: string;
    product_name: string;
    quantity: number;
    amount: number;
    time: string;
    type?: 'COMMERCIAL' | 'GIVEAWAY';
  }) {
    this.server.to(roomId).emit('new_order', order);
  }

  @SubscribeMessage('trigger_giveaway')
  @UseGuards(WsJwtGuard)
  async handleTriggerGiveaway(client: any, payload: { roomId: string; livestreamId: number; giveawayId: number; durationSeconds?: number }) {
    const giveaway = await this.giveawaysService.getGiveawayById(payload.giveawayId);

    const endTime = payload.durationSeconds
      ? new Date(Date.now() + payload.durationSeconds * 1000).toISOString()
      : undefined;

    this.giveawayStates.set(payload.roomId, {
      id: giveaway.id,
      keyword: giveaway.keyword,
      slots: giveaway.slots_limit,
      participants: new Map(),
      isActive: true,
      variantId: giveaway.variant_id,
      endTime
    });

    await this.giveawaysService.updateStatus(giveaway.id, 'ACTIVE');

    this.server.to(payload.roomId).emit('giveaway_started', {
      id: giveaway.id,
      keyword: giveaway.keyword,
      slots: giveaway.slots_limit,
      status: 'ACTIVE',
      end_time: endTime
    });
  }

  @SubscribeMessage('cancel_giveaway')
  @UseGuards(WsJwtGuard)
  async handleCancelGiveaway(client: any, payload: { roomId: string; livestreamId: number; giveawayId?: number }) {
    const gid = payload.giveawayId;
    if (!gid) {
      console.error(`[Socket] cancel_giveaway error: giveawayId is missing in payload`, payload);
      return;
    }
    
    this.giveawayStates.delete(payload.roomId);
    await this.giveawaysService.updateStatus(gid, 'CANCELLED');
    this.server.to(payload.roomId).emit('giveaway_cancelled', { giveaway_id: gid });
    console.log(`[Socket] Giveaway ${gid} cancelled in room ${payload.roomId}`);
  }

  @SubscribeMessage('select_giveaway_winner')
  @UseGuards(WsJwtGuard)
  async handleSelectWinner(client: any, payload: { roomId: string; livestreamId: number }) {
    const state = this.giveawayStates.get(payload.roomId);
    if (!state || state.participants.size === 0) return;

    state.isActive = false; // Stop accepting entries
    
    // Convert Map to Array for Wheel participants: { userId, name }
    const participantList = Array.from(state.participants.entries()).map(([userId, name]) => ({ userId, name }));
    const winnerObj = participantList[Math.floor(Math.random() * participantList.length)];
    const winnerId = winnerObj.userId;

    // Trigger visual spin first
    this.server.to(payload.roomId).emit('giveaway_draw_started', {
      participants: participantList
    });

    // We can delay the winner resolution for 5 seconds to sync with the spin animation
    setTimeout(async () => {
      // 1. Record Winner in DB (Persistence)
      await this.giveawaysService.recordWinner(state.id, winnerId);

      // 2. Create Giveaway Claim (Right to claim)
      const result = await this.ordersService.createGiveawayClaim(winnerId, state.variantId, payload.livestreamId, state.id);

      this.server.to(payload.roomId).emit('giveaway_winner_selected', {
        user_id: winnerId,
        result_type: result.type, // 'ORDER' or 'CLAIM'
        claim_id: (result as any).claim?.claim_id || null,
        variant_id: state.variantId,
        giveaway_id: state.id
      });

      // Cleanup state
      this.giveawayStates.delete(payload.roomId);
    }, 5000);
  }

  @SubscribeMessage('claim_giveaway_prize')
  // @UseGuards(WsJwtGuard) <-- TEMPORARY REMOVAL TO DEBUG SILENT REJECTION
  async handleClaimPrize(client: any, payload: { claimId: number }) {
    console.log(`[Socket] !!! EMERGENCY RECEIVE !!! claim_giveaway_prize payload:`, payload);
    
    // Fallback userId if guard is off (though guard should be on in production)
    const userId = client.user?.user_id || payload['userId']; 
    console.log(`[Socket] Processing for User ID:`, userId);
    
    try {
      // REDIRECT: Add to cart instead of creating order directly
      await this.cartService.addGiveawayToCart(userId, payload.claimId);
      console.log(`[Socket] Claim Success: User ${userId}, ClaimID ${payload.claimId}`);
      
      this.server.to(client.id).emit('giveaway_claim_success', { 
        message: 'Món quà đã được thêm vào giỏ hàng của bạn với giá 0đ!',
        claim_id: payload.claimId 
      });
    } catch (err: any) {
      console.error(`[Socket] Claim Error: ${err.message}`);
      this.server.to(client.id).emit('giveaway_claim_error', { message: err.message });
    }
  }

  // --- NEW: Signal a price/stock update to all viewers ---
  broadcastProductUpdate(roomId: string, variantId: number) {
    this.server.to(roomId).emit('product_update', { variant_id: variantId });
    console.log(`[Socket] Room ${roomId}: Product ${variantId} update signal sent.`);
  }
}
