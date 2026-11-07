import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCsrfProtection();

  app.setGlobalPrefix('api');

  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
await bootstrap();
