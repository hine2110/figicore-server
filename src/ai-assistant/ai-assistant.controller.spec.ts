import { Test, TestingModule } from '@nestjs/testing';
import { AiAssistantController } from './ai-assistant.controller';

describe('AiAssistantController', () => {
  let controller: AiAssistantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiAssistantController],
    }).compile();

    controller = module.get<AiAssistantController>(AiAssistantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
