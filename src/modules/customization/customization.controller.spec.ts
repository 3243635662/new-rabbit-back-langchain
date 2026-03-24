import { Test, TestingModule } from '@nestjs/testing';
import { CustomizationController } from './customization.controller';

describe('CustomizationController', () => {
  let controller: CustomizationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomizationController],
    }).compile();

    controller = module.get<CustomizationController>(CustomizationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
