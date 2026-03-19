import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3003);
  app.useGlobalFilters(new HttpExceptionFilter());
  // 配置跨域
  app.enableCors();
  // 配置全局前缀
  app.setGlobalPrefix('api');
  await app.listen(PORT, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${PORT}`);
}
bootstrap().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
