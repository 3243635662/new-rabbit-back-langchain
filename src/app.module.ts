import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { UserModule } from './modules/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from './modules/db/redis/redis.module';
// import { APP_GUARD } from '@nestjs/core';
// import { ApiKeyGuard } from './common/guards/apikey.guard';
import { EmailModule } from './modules/email/email.module';
import { ClientHomeModule } from './modules/clientHome/clientHome.module';
import { MenuModule } from './modules/menu/menu.module';
import { RoleModule } from './modules/role/role.module';
import { AddressModule } from './modules/address/address.module';
import { CustomizationModule } from './modules/customization/customization.module';
import { GoodsModule } from './modules/goods/goods.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { OrderModule } from './modules/order/order.module';
import { SeedModule } from './modules/db/seed/seed.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AdminModule } from './modules/admin/admin.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { ScheduleModule } from '@nestjs/schedule';
import { LangChainModule } from './langchain/langchain.module';
import { QiniuModule } from './modules/qiniu/qiniu.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
@Module({
  imports: [
    MenuModule,
    ClientHomeModule,
    AuthModule,
    UserModule,
    RedisModule,
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '..', '.env'),
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('MYSQL_HOST'),
        port: configService.get<number>('MYSQL_PORT'),
        username: configService.get<string>('MYSQL_USER'),
        password: configService.get<string>('MYSQL_PASSWORD'),
        database: configService.get<string>('MYSQL_DATABASE'),
        entities: [join(__dirname, '**', '*.entity.{ts,js}')],
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
    EmailModule,
    RoleModule,
    AddressModule,
    CustomizationModule,
    GoodsModule,
    MerchantModule,
    OrderModule,
    SeedModule,
    InventoryModule,
    AdminModule,
    CouponModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: new Redis({
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    LangChainModule,
    QiniuModule,
    KnowledgeBaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // {
    //   provide: APP_GUARD,
    //   useClass: ApiKeyGuard,
    // },
  ],
})
export class AppModule {}
