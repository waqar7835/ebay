import { existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import type { StorageEngine } from "multer";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const uploadsDir = join(process.cwd(), process.env.UPLOADS_DIR ?? "uploads");

const r2Enabled = !!process.env.R2_ACCOUNT_ID;

const r2Client = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    })
  : null;

class R2Storage implements StorageEngine {
  constructor(private readonly subfolder: string) {}

  _handleFile(
    _req: unknown,
    file: Express.Multer.File,
    cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
  ) {
    const filename = `${randomUUID()}${extname(file.originalname)}`;
    const key = `${this.subfolder}/${filename}`;
    const chunks: Buffer[] = [];

    file.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    file.stream.on("error", (err) => cb(err));
    file.stream.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        await r2Client!.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: file.mimetype,
          }),
        );
        cb(null, { filename, size: body.length });
      } catch (err) {
        cb(err as Error);
      }
    });
  }

  _removeFile(_req: unknown, file: Express.Multer.File, cb: (error: Error | null) => void) {
    r2Client!
      .send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `${this.subfolder}/${file.filename}` }))
      .then(() => cb(null))
      .catch(cb);
  }
}

export function ensureUploadsDir(): string {
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

export function multerUploadOptions(
  subfolder: string,
  options?: { fileFilter?: MulterOptions["fileFilter"]; maxFileSize?: number },
): MulterOptions {
  const limits = { fileSize: options?.maxFileSize ?? 5 * 1024 * 1024 };

  if (r2Enabled) {
    return {
      storage: new R2Storage(subfolder),
      limits,
      fileFilter: options?.fileFilter,
    };
  }

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
    limits,
    fileFilter: options?.fileFilter,
  };
}

export function publicUploadUrl(subfolder: string, filename: string): string {
  if (r2Enabled) {
    return `${process.env.R2_PUBLIC_URL}/${subfolder}/${filename}`;
  }
  return `/uploads/${subfolder}/${filename}`;
}
