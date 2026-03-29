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
import { InventoryService } from './modules/inventory/inventory.service';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryModule } from './modules/inventory/inventory.module';
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
  ],
  controllers: [AppController, InventoryController],
  providers: [
    AppService,
    InventoryService,

    // {
    //   provide: APP_GUARD,
    //   useClass: ApiKeyGuard,
    // },
  ],
})
export class AppModule {}
