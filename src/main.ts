import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>('PORT', 3003);

  // ── Bull Board 可视化面板（必须放在 setGlobalPrefix 之前，避免被 /api 前缀拦截） ──
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');

  const redisHost = configService.get<string>('REDIS_HOST', '127.0.0.1');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);

  createBullBoard({
    queues: [
      new BullMQAdapter(
        new Queue('rag-queue', {
          connection: { host: redisHost, port: redisPort },
        }),
      ),
    ],
    serverAdapter,
  });

  app.use('/queues', serverAdapter.getRouter());
  // ───────────────────────────────────────────────────────────────

  app.useGlobalFilters(new HttpExceptionFilter());
  // app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  // 全局验证管道 DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剔除 DTO 中未定义的属性
      forbidNonWhitelisted: true, // 禁止传入 DTO 中未定义的属性
      transform: true, // 自动转换类型
      disableErrorMessages: false,
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          field: error.property,
          errors: Object.values(error.constraints || {}),
        }));
        return new BadRequestException({
          message: '参数校验失败',
          details: messages, // 详细错误信息
        });
      },
    }),
  );

  // 配置跨域
  app.enableCors();
  // 配置全局前缀
  app.setGlobalPrefix('api');
  await app.listen(PORT, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${PORT}`);
  console.log(`Bull Board is running on: http://localhost:${PORT}/queues`);
}
bootstrap().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
