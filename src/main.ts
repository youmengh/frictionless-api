import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every route lives under /api (matches the frontend dev proxy).
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Frictionless — SOI Investment Allocator API')
    .setDescription(
      'Fetches live fund/ETF/stock data and runs the Score of Investibility ' +
        '(SOI) allocation algorithm: SOI = 10·r − 100·x − 20·max(0, β−1).',
    )
    .setVersion('1.0')
    .addTag('health')
    .addTag('funds')
    .addTag('allocate')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Interactive docs + "try it out" UI at /api/docs
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`SOI API listening on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI at http://localhost:${port}/api/docs`);
}

bootstrap();
