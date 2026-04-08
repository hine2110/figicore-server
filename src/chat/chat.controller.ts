import { Controller, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Get('test')
  async testChat(@Query('msg') msg: string) {
    const text = msg || 'Có sản phẩm gì mới không bạn?';
    return this.chatService.getAiResponse(text, []);
  }
}

