import { Module } from '@nestjs/common';
import { SnowflakeIdService } from './services/snowflake-id.service';
import { OrderNoGeneratorService } from './services/order-no-generator.service';

@Module({
  providers: [SnowflakeIdService, OrderNoGeneratorService],
  exports: [SnowflakeIdService, OrderNoGeneratorService],
})
export class CommonModule {}
