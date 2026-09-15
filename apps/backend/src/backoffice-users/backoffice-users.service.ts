import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/sequelize";
import * as bcrypt from "bcrypt";
import { Role, TokenPurpose, UserStatus } from "@ebay-order-management/shared";
import { BackofficeUser } from "../database/models/backoffice-user.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { MailerService } from "../mailer/mailer.service";
import { TokensService } from "../tokens/tokens.service";
import { BackofficePermissionsInput, InviteBackofficeUserDto } from "./dto/invite-backoffice-user.dto";

/** Placeholder password set on invited accounts before the user completes accept-invite; never surfaced to anyone. */
const DEFAULT_INVITE_PASSWORD = "changeme";

@Injectable()
export class BackofficeUsersService {
  constructor(
    @InjectModel(BackofficeUser) private readonly backofficeUserModel: typeof BackofficeUser,
    @InjectModel(BackofficeStaffProfile) private readonly staffProfileModel: typeof BackofficeStaffProfile,
    private readonly tokensService: TokensService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async list() {
    const users = await this.backofficeUserModel.findAll({ include: [BackofficeStaffProfile] });
    return users.map((u) => this.toDto(u));
  }

  private toDto(user: BackofficeUser) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      role: user.role,
      backofficeStaffProfile: user.backofficeStaffProfile,
      createdAt: user.createdAt,
    };
  }

  async invite(invitedByUserId: string, dto: InviteBackofficeUserDto) {
    const existing = await this.backofficeUserModel.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const user = await this.backofficeUserModel.create({
      name: dto.name ?? null,
      email: dto.email,
      status: UserStatus.INVITED,
      role: Role.PLATFORM_STAFF,
      passwordHash: await bcrypt.hash(DEFAULT_INVITE_PASSWORD, 10),
    });

    await this.upsertPermissions(user.id, dto.permissions);
    await this.sendInviteEmail(user);

    return this.get(user.id);
  }

  async get(id: string) {
    const user = await this.backofficeUserModel.findOne({ where: { id }, include: [BackofficeStaffProfile] });
    if (!user) throw new NotFoundException("Backoffice user not found");
    return this.toDto(user);
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.backofficeUserModel.findByPk(id);
    if (!user) throw new NotFoundException("Backoffice user not found");
    user.status = status;
    await user.save();
    return this.get(id);
  }

  async upsertPermissions(userId: string, input: BackofficePermissionsInput) {
    const [profile] = await this.staffProfileModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      canManageOrders: input.canManageOrders,
      canManageStock: input.canManageStock,
      canManageUsers: input.canManageUsers,
      canGenerateInvoices: input.canGenerateInvoices,
      canViewFinancials: input.canViewFinancials,
    });
    await profile.save();
    return profile;
  }

  private async sendInviteEmail(user: BackofficeUser) {
    const record = await this.tokensService.issue({
      email: user.email,
      companyId: null,
      backofficeUserId: user.id,
      purpose: TokenPurpose.USER_INVITE,
    });

    const url = `${this.config.get<string>("BACKOFFICE_URL")}/accept-invite?token=${record.token}`;

    await this.mailer.send(
      user.email,
      "You've been invited",
      `<p>You've been invited to join the backoffice as Platform Staff. Click to set your password: <a href="${url}">${url}</a></p><p>This link expires in 7 days.</p>`,
    );
  }
}
