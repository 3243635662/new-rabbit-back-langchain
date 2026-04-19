import { Test, TestingModule } from '@nestjs/testing';
import { MerchantRagController } from './merchant-rag.controller';

describe('MerchantRagController', () => {
  let controller: MerchantRagController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantRagController],
    }).compile();

    controller = module.get<MerchantRagController>(MerchantRagController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
