import { join, posix } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import type { NextFunction, Request, Response } from "express";
import { PRIVATE_UPLOAD_FOLDERS, ensureUploadsDir } from "./uploads/uploads.util";
import { DatabaseExceptionFilter } from "./common/filters/database-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Which proxy hops to trust for the client IP (rate limits). Unset = none (req.ip is the direct peer, and
  // X-Forwarded-For is ignored, so it can't be spoofed). Behind a host's load balancer set e.g. TRUST_PROXY=1 (one hop),
  // or a subnet / list as Express accepts.
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);

  const allowedOrigins = process.env.FRONTEND_URLS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DatabaseExceptionFilter());
  // Basic browser-protection headers on every API response (security audit 2026-11-13). HSTS and a CSP are left for
  // later (CLAUDE.md Known limitations) since they depend on the deployment.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  // Receipts and shipping labels are private: only served through their authenticated API routes, never as files.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.toLowerCase().startsWith("/uploads")) return next();
    let path: string;
    try {
      // Decoded, lower-cased, repeated / or \ collapsed and "." / ".." segments resolved (the static server resolves
      // them too), so no spelling of the path slips past.
      path = posix.normalize(decodeURIComponent(req.path).toLowerCase().replace(/[\\/]+/g, "/"));
    } catch {
      res.status(400).json({ statusCode: 400, message: "Bad path" });
      return;
    }
    if (PRIVATE_UPLOAD_FOLDERS.some((folder) => path.startsWith(`/uploads/${folder}/`))) {
      res.status(404).json({ statusCode: 404, message: "Not found" });
      return;
    }
    next();
  });
  app.useStaticAssets(ensureUploadsDir(), {
    prefix: "/uploads/",
    dotfiles: "deny",
    // Never let a browser guess a stored file's type (e.g. render something as a page).
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  });

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

function parseTrustProxy(raw: string | undefined): boolean | number | string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

bootstrap();
