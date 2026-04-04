import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Injectable, Logger } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { LivestreamsService } from './livestreams.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'livestream-live',
})
export class LivestreamLiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly livestreamsService: LivestreamsService) {}

  private roomParticipants: Map<string, Map<string, { userId?: number; isHost: boolean }>> = new Map();
  private roomChatHistory: Map<string, any[]> = new Map();

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
    customer_name: string;
    product_name: string;
    quantity: number;
    amount: number;
    time: string;
  }) {
    this.server.to(roomId).emit('new_order', order);
  }

  // --- NEW: Signal a price/stock update to all viewers ---
  broadcastProductUpdate(roomId: string, variantId: number) {
    this.server.to(roomId).emit('product_update', { variant_id: variantId });
    console.log(`[Socket] Room ${roomId}: Product ${variantId} update signal sent.`);
  }
}
