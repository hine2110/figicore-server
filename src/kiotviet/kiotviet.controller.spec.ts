import { Test, TestingModule } from '@nestjs/testing';
import { KiotVietController } from './kiotviet.controller';
import { KiotVietService } from './kiotviet.service';

describe('KiotVietController', () => {
  let controller: KiotVietController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KiotVietController],
      providers: [
        {
          provide: KiotVietService,
          useValue: {
            syncProductTaxes: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<KiotVietController>(KiotVietController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
