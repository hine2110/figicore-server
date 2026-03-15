import { Test, TestingModule } from '@nestjs/testing';
import { AiAssistantService } from './ai-assistant.service';

describe('AiAssistantService', () => {
  let service: AiAssistantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiAssistantService],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
