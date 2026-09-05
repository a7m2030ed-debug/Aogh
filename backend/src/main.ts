import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Standard hardening headers (nosniff, frameguard, HSTS, and the rest).
  app.use(helmet());
  // gzip on responses — the request feed and conversation lists are JSON
  // with repetitive keys, which compresses to a fraction of the bytes.
  // On mobile data that is felt directly as load time.
  app.use(compression());

  // Cross-origin requests are left disabled (Nest's default). The mobile
  // app isn't a browser and is unaffected; enable CORS deliberately, for
  // a named origin, if a web admin dashboard is ever built.

  // Bodies are small by design — the only large payload is a photo, and
  // that goes straight to storage via a presigned URL, never through here.
  app.use(express.json({ limit: '256kb' }));

  // One API gateway for both the mobile app and the admin web dashboard
  // (review section 7.1 "بوابة API واحدة") — versioned from day one so a
  // breaking change never forces both clients to update in lockstep.
  app.setGlobalPrefix('api/v1');
  // forbidNonWhitelisted rejects unknown fields outright instead of
  // silently dropping them, so a client sending something the DTO doesn't
  // declare gets told rather than quietly ignored.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Swagger/OpenAPI generated straight from the code (review section 7.8)
  // so the API doc never drifts from the API. Off in production: a public
  // map of every endpoint and its request shape is free reconnaissance,
  // and nobody needs it from the production host — run the app locally, or
  // set SWAGGER_ENABLED=true deliberately if a staging box should serve it.
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('قطعتي API')
      .setDescription('Backend API for the "قطعتي" used-car-parts request platform')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
