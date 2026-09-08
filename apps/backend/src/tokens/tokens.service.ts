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

@Injectable()
export class TokensService {
  constructor(@InjectModel(VerificationToken) private readonly tokenModel: typeof VerificationToken) {}

  async issue(params: {
    email: string;
    companyId: string | null;
    userId?: string;
    backofficeUserId?: string;
    purpose: TokenPurpose;
  }): Promise<VerificationToken> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TTL_MINUTES[params.purpose] * 60_000);

    return this.tokenModel.create({
      token,
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
}
