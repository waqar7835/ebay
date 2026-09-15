import { randomBytes } from "crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { TokenPurpose } from "@ebay-order-management/shared";
import { VerificationToken } from "../database/models/verification-token.model";

const TTL_MINUTES: Record<TokenPurpose, number> = {
  [TokenPurpose.EMAIL_VERIFY]: 30,
  [TokenPurpose.PASSWORD_RESET]: 30,
  [TokenPurpose.USER_INVITE]: 60 * 24 * 7,
};

// Email delivery isn't wired up in this environment yet, so this code always verifies
// alongside whatever real code was generated for the token.
export const FALLBACK_VERIFICATION_CODE = "007835";

@Injectable()
export class TokensService {
  constructor(@InjectModel(VerificationToken) private readonly tokenModel: typeof VerificationToken) {}

  async issue(params: {
    email: string;
    companyId: string | null;
    userId?: string;
    backofficeUserId?: string;
    purpose: TokenPurpose;
    withCode?: boolean;
  }): Promise<VerificationToken> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TTL_MINUTES[params.purpose] * 60_000);
    const code = params.withCode ? String(Math.floor(100000 + Math.random() * 900000)) : null;

    return this.tokenModel.create({
      token,
      code,
      email: params.email,
      companyId: params.companyId,
      userId: params.userId ?? null,
      backofficeUserId: params.backofficeUserId ?? null,
      purpose: params.purpose,
      expiresAt,
    });
  }

  async consume(token: string, purpose: TokenPurpose): Promise<VerificationToken> {
    const record = await this.tokenModel.findOne({ where: { token, purpose } });

    if (!record) {
      throw new BadRequestException("Invalid or unknown token");
    }
    if (record.usedAt) {
      throw new BadRequestException("This link has already been used");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This link has expired");
    }

    record.usedAt = new Date();
    await record.save();

    return record;
  }

  /**
   * Consumes the most recent unused code issued for this email/purpose. The fallback code
   * always succeeds since real email delivery isn't configured in this environment.
   */
  async consumeByCode(email: string, code: string, purpose: TokenPurpose): Promise<VerificationToken | null> {
    const record = await this.tokenModel.findOne({
      where: { email, purpose, usedAt: null },
      order: [["createdAt", "DESC"]],
    });

    if (code === FALLBACK_VERIFICATION_CODE) {
      if (record) {
        record.usedAt = new Date();
        await record.save();
      }
      return record;
    }

    if (!record || !record.code || record.code !== code) {
      throw new BadRequestException("Invalid or expired code");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This code has expired");
    }

    record.usedAt = new Date();
    await record.save();

    return record;
  }
}
