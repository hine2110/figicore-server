import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';

@WebSocketGateway({
    namespace: '/chat',
    cors: {
        origin: ['https://figicore.com', 'https://api.figicore.com', 'http://localhost:5173'],
        credentials: true
    },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('ChatGateway');

    constructor(private readonly chatService: ChatService) { }

    afterInit(server: Server) {
        this.logger.log('AI Chat Gateway Initialized');
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected to chat: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected from chat: ${client.id}`);
    }

    @SubscribeMessage('send_message')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { message: string; history: { role: 'user' | 'model'; parts: string }[] },
    ) {
        this.logger.log(`Message received from ${client.id}: ${data.message}`);

        // Get AI response
        const aiResponse = await this.chatService.getAiResponse(data.message, data.history || []);

        // Emit response back to the client
        client.emit('receive_message', {
            text: aiResponse,
            timestamp: new Date().toISOString(),
            role: 'model',
        });
    }
}
