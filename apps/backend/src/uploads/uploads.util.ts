import { existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

const uploadsDir = join(process.cwd(), process.env.UPLOADS_DIR ?? "uploads");

export function ensureUploadsDir(): string {
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

export function multerDiskOptions(subfolder: string): MulterOptions {
  const dir = join(ensureUploadsDir(), subfolder);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
  };
}

export function publicUploadUrl(subfolder: string, filename: string): string {
  return `/uploads/${subfolder}/${filename}`;
}
