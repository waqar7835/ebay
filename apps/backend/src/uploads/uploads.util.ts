import { existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { diskStorage } from "multer";
import type { StorageEngine } from "multer";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const uploadsDir = join(process.cwd(), process.env.UPLOADS_DIR ?? "uploads");

const r2Enabled = !!process.env.R2_ACCOUNT_ID;
/**
 * Private files (payment receipts, shipping labels) go to this bucket, which must have NO public access: they're only
 * read back by the API (`GET /orders/:id/shipping-label`, `GET /subscriptions/payments/:id/receipt`) after checking who
 * asks. Without it they fall back to the public bucket (still only served through those routes, but the bucket URL
 * would open them too) — set it before launch.
 */
const r2PrivateBucket = process.env.R2_PRIVATE_BUCKET || null;
/** Stored reference for a file in the private bucket (never a URL anyone can open). */
const PRIVATE_REF_PREFIX = "r2-private:";

/**
 * Local-disk folders holding private files. `main.ts` refuses to serve them under /uploads; they're only read back
 * through the API routes above.
 */
export const PRIVATE_UPLOAD_FOLDERS = ["receipts", "shipping-labels"] as const;
export type PrivateUploadFolder = (typeof PRIVATE_UPLOAD_FOLDERS)[number];

/**
 * Allowed upload types → the extension the file is saved with (security audit 2026-11-13). The type and extension are
 * never taken from the uploaded file name, so nothing like .html / .svg can be stored and served as a page.
 */
export type UploadTypes = Readonly<Record<string, string>>;
export const IMAGE_TYPES: UploadTypes = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
/** pdfkit can only draw PNG and JPEG (invoice template logos). */
export const PDF_IMAGE_TYPES: UploadTypes = { "image/jpeg": ".jpg", "image/png": ".png" };
export const FAVICON_TYPES: UploadTypes = { ...IMAGE_TYPES, "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico" };
export const PDF_TYPES: UploadTypes = { "application/pdf": ".pdf" };
export const RECEIPT_TYPES: UploadTypes = { ...PDF_TYPES, ...IMAGE_TYPES };

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

function savedName(file: Express.Multer.File, types: UploadTypes): string {
  return `${randomUUID()}${types[file.mimetype]}`;
}

class R2Storage implements StorageEngine {
  constructor(
    private readonly subfolder: string,
    private readonly bucket: string,
    private readonly types: UploadTypes,
  ) {}

  _handleFile(
    _req: unknown,
    file: Express.Multer.File,
    cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
  ) {
    const filename = savedName(file, this.types);
    const key = `${this.subfolder}/${filename}`;
    const chunks: Buffer[] = [];

    file.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    file.stream.on("error", (err) => cb(err));
    file.stream.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        await r2Client!.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            // Only ever one of the allowed types (checked by the file filter).
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
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `${this.subfolder}/${file.filename}` }))
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

/** Multer file filter accepting only the given types (also used by in-memory uploads, e.g. template previews). */
export function uploadTypeFilter(types: UploadTypes, typeError: string): NonNullable<MulterOptions["fileFilter"]> {
  return (_req, file, cb) => {
    if (Object.prototype.hasOwnProperty.call(types, file.mimetype)) cb(null, true);
    else cb(new BadRequestException(typeError), false);
  };
}

export function multerUploadOptions(
  subfolder: string,
  options: { types: UploadTypes; typeError: string; maxFileSize?: number },
): MulterOptions {
  const limits = { fileSize: options.maxFileSize ?? 5 * 1024 * 1024 };
  const fileFilter = uploadTypeFilter(options.types, options.typeError);
  const isPrivate = (PRIVATE_UPLOAD_FOLDERS as readonly string[]).includes(subfolder);

  if (r2Enabled) {
    const bucket = (isPrivate && r2PrivateBucket) || (process.env.R2_BUCKET as string);
    return { storage: new R2Storage(subfolder, bucket, options.types), limits, fileFilter };
  }

  const dir = join(ensureUploadsDir(), subfolder);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, savedName(file, options.types)),
    }),
    limits,
    fileFilter,
  };
}

export function publicUploadUrl(subfolder: string, filename: string): string {
  if (r2Enabled) {
    return `${process.env.R2_PUBLIC_URL}/${subfolder}/${filename}`;
  }
  return `/uploads/${subfolder}/${filename}`;
}

/**
 * What to store for a private file (receipt, shipping label): a reference only the API can read back (`readUpload`),
 * never served directly — the apps download it through an authenticated route.
 */
export function privateUploadRef(subfolder: PrivateUploadFolder, filename: string): string {
  if (r2Enabled && r2PrivateBucket) return `${PRIVATE_REF_PREFIX}${subfolder}/${filename}`;
  return publicUploadUrl(subfolder, filename);
}

/** Content type of a stored file, from the extension it was saved with (we chose it, see UploadTypes). */
export function uploadContentType(ref: string): string {
  const ext = ref.slice(ref.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };
  return types[ext] ?? "application/octet-stream";
}

/**
 * Reads back a file saved through these helpers (a `/uploads/...` path, an R2 public URL or a private-bucket reference);
 * null if unavailable. Only ever called with references this API stored itself.
 */
export async function readUpload(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("/uploads/")) {
      const relative = url.slice("/uploads/".length);
      if (relative.split("/").includes("..")) return null;
      return await readFile(join(uploadsDir, relative));
    }
    if (url.startsWith(PRIVATE_REF_PREFIX)) {
      if (!r2Client || !r2PrivateBucket) return null;
      const res = await r2Client.send(new GetObjectCommand({ Bucket: r2PrivateBucket, Key: url.slice(PRIVATE_REF_PREFIX.length) }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    }
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
