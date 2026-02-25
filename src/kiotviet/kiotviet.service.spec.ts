import { Test, TestingModule } from '@nestjs/testing';
import { KiotVietService } from './kiotviet.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

describe('KiotVietService', () => {
  let service: KiotVietService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KiotVietService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            product_variants: {
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<KiotVietService>(KiotVietService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
