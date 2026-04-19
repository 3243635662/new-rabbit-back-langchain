import { Test, TestingModule } from '@nestjs/testing';
import { MerchantRagService } from './merchant-rag.service';

describe('MerchantRagService', () => {
  let service: MerchantRagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantRagService],
    }).compile();

    service = module.get<MerchantRagService>(MerchantRagService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
