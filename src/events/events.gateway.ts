import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    namespace: '/events',
    cors: {
        origin: ['https://figicore.com', 'https://api.figicore.com', 'http://localhost:5173'],
        credentials: true
    },
})
export class EventsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('EventsGateway');

    afterInit(server: Server) {
        this.logger.log('Socket Gateway Initialized');
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.log(`Client connected: ${client.id}`);
        // Optional: Join rooms based on role (e.g., client.join('warehouse'))
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    // --- PUBLIC METHODS (Called by Services) ---

    /**
     * Bắn thông báo cho Kho khi có đơn mới
     */
    notifyNewOrder(orderData: any) {
        this.server.emit('warehouse:new_order', orderData);
        this.logger.log(`🔔 Emitted warehouse:new_order for Order #${orderData.order_code}`);
    }

    /**
     * Bắn thông báo khi thanh toán thành công
     */
    notifyPaymentSuccess(orderId: number | string) {
        this.server.emit(`payment:success:${orderId}`);
        this.logger.log(`🔔 Emitted payment:success:${orderId}`);
    }

    /**
     * Bắn thông báo cho Manager khi có yêu cầu Hoàn Hàng mới
     */
    notifyNewReturnRequest(returnData: any) {
        this.server.emit('manager:new_return_request', returnData);
        this.logger.log(`🔔 Emitted manager:new_return_request for Return #${returnData.return_id}`);
    }

    /**
     * Bắn thông báo trực tiếp cho một khách hàng bằng ID
     */
    notifyCustomer(userId: number, title: string, content: string) {
        this.server.emit(`customer:notify:${userId}`, { title, content });
        this.logger.log(`🔔 Emitted customer:notify:${userId}`);
    }

    /**
     * Thông báo cho một người dùng cụ thể về một sự kiện
     */
    notifyUser(userId: number, event: string, data: any) {
        this.server.emit(`user:${userId}:${event}`, data);
        this.logger.log(`🔔 Emitted user:${userId}:${event}`);
    }

    /**
     * Notify about order status update for real-time UI refresh
     */
    notifyOrderStatusUpdate(orderId: number | string, status: string, orderData?: any) {
        this.server.emit(`order:status_update:${orderId}`, { status, orderData });
        // Also notify general warehouse if it is a status they care about
        this.server.emit('warehouse:order_status_update', { orderId, status });
        this.logger.log(`🔔 Emitted order:status_update:${orderId} with status ${status}`);
    }
}
