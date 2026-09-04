import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // One API gateway for both the mobile app and the admin web dashboard
  // (review section 7.1 "بوابة API واحدة") — versioned from day one so a
  // breaking change never forces both clients to update in lockstep.
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger/OpenAPI generated straight from the code (review section 7.8)
  // so the API doc for whoever integrates with this backend never drifts.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('قطعتي API')
    .setDescription('Backend API for the "قطعتي" used-car-parts marketplace platform')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
