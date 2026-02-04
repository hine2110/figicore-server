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
        origin: '*', // Allow all for Dev, restrict in Prod if needed
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
}
