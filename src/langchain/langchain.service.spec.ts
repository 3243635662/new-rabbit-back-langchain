import { Test, TestingModule } from '@nestjs/testing';
import { LangChainService } from './langchain.service';

describe('LangchainService', () => {
  let service: LangChainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LangChainService],
    }).compile();

    service = module.get<LangChainService>(LangChainService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
