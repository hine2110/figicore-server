import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/scanner', // Sử dụng namespace riêng biệt để tránh đụng độ
})
export class ScannerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('ScannerGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(roomId);
    this.logger.log(`Client ${client.id} joined room: ${roomId}`);
    return { event: 'joined', data: roomId };
  }

  @SubscribeMessage('send-barcode')
  handleSendBarcode(
    @MessageBody() data: { roomId: string; barcode: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Received barcode ${data.barcode} for room ${data.roomId}`);
    // Chuyển tiếp mã vạch tới màn hình PC đang ở trong cùng một roomId
    client.to(data.roomId).emit('receive-barcode', { barcode: data.barcode });
    return { event: 'barcode-sent', success: true };
  }

  @SubscribeMessage('scan-feedback')
  handleScanFeedback(
    @MessageBody() data: { roomId: string; success: boolean; message: string; productName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    // PC gửi phản hồi lại cho điện thoại (thêm thành công / lỗi)
    client.to(data.roomId).emit('scan-feedback', data);
  }
}
