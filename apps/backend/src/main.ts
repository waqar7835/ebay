import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ensureUploadsDir } from "./uploads/uploads.util";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = process.env.FRONTEND_URLS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useStaticAssets(ensureUploadsDir(), { prefix: "/uploads/" });

  const config = new DocumentBuilder()
    .setTitle("eBay Order Management API")
    .setVersion("0.1")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
}

bootstrap();
