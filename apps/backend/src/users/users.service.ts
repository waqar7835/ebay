import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/sequelize";
import * as bcrypt from "bcrypt";
import { ProductFulfillmentType, Role, TokenPurpose, UserStatus } from "@ebay-order-management/shared";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { MailerService } from "../mailer/mailer.service";
import { TokensService } from "../tokens/tokens.service";
import { BillingService } from "../billing/billing.service";
import {
  AccountHolderProfileInput,
  InviteUserDto,
  StaffPermissionsInput,
  StockOwnerProfileInput,
  ThreePlProfileInput,
} from "./dto/invite-user.dto";
import { ChangePasswordDto, UpdateOwnProfileDto } from "./dto/update-own-profile.dto";

const PROFILE_INCLUDES = [StaffProfile, AccountHolderProfile, StockOwnerProfile, ThreePlProfile, UserRoleAssignment];
const PAID_ROLES = [Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL];
/** Placeholder password set on invited accounts before the user completes accept-invite; never surfaced to anyone. */
const DEFAULT_INVITE_PASSWORD = "changeme";
/** ADMIN is created at company registration and SUPER_ADMIN is a platform-level seed; neither is invitable. */
const INVITABLE_ROLES = [Role.STAFF, ...PAID_ROLES];

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(UserRoleAssignment) private readonly userRoleModel: typeof UserRoleAssignment,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(AccountHolderProfile) private readonly accountHolderModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlModel: typeof ThreePlProfile,
    private readonly tokensService: TokensService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  async list(companyId: string) {
    const users = await this.userModel.findAll({ where: { companyId }, include: PROFILE_INCLUDES });
    return users.map((u) => this.toDto(u));
  }

  async get(companyId: string, userId: string) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, include: PROFILE_INCLUDES });
    if (!user) throw new NotFoundException("User not found");
    return this.toDto(user);
  }

  /** Matches the `UserDto` contract in @ebay-order-management/shared: a flat `roles` array, not raw join rows. */
  private toDto(user: User) {
    return {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      status: user.status,
      roles: user.roleAssignments.map((r) => r.role),
      staffProfile: user.staffProfile,
      accountHolderProfile: user.accountHolderProfile,
      stockOwnerProfile: user.stockOwnerProfile,
      threePlProfile: user.threePlProfile,
      createdAt: user.createdAt,
    };
  }

  async invite(companyId: string, invitedByUserId: string, dto: InviteUserDto) {
    const notInvitable = dto.roles.find((role) => !INVITABLE_ROLES.includes(role));
    if (notInvitable) {
      throw new BadRequestException(`The ${notInvitable} role cannot be assigned through an invite`);
    }

    // Email is unique per role, not globally: the same person can hold a separate account for
    // each role (Staff, Account Holder, Stock Owner, 3PL), each invited and signed into independently.
    const conflict = await this.userRoleModel.findOne({
      where: { role: dto.roles },
      include: [{ model: this.userModel, where: { email: dto.email }, attributes: [] }],
    });
    if (conflict) {
      throw new ConflictException(`An account with this email already exists for the ${conflict.role} role`);
    }

    const user = await this.userModel.create({
      companyId,
      name: dto.name ?? null,
      email: dto.email,
      status: UserStatus.INVITED,
      passwordHash: await bcrypt.hash(DEFAULT_INVITE_PASSWORD, 10),
    });

    await this.userRoleModel.bulkCreate(dto.roles.map((role) => ({ userId: user.id, role })));

    if (dto.roles.includes(Role.STAFF)) {
      await this.upsertStaffProfile(user.id, dto.staffPermissions ?? defaultStaffPermissions());
    }
    if (dto.roles.includes(Role.ACCOUNT_HOLDER)) {
      if (!dto.accountHolderProfile) {
        throw new BadRequestException("accountHolderProfile is required for the Account Holder role");
      }
      await this.upsertAccountHolderProfile(user.id, dto.accountHolderProfile);
    }
    if (dto.roles.includes(Role.STOCK_OWNER)) {
      if (!dto.stockOwnerProfile) {
        throw new BadRequestException("stockOwnerProfile is required for the Stock Owner role");
      }
      await this.upsertStockOwnerProfile(user.id, dto.stockOwnerProfile);
    }
    if (dto.roles.includes(Role.THREE_PL)) {
      if (!dto.threePlProfile) {
        throw new BadRequestException("threePlProfile is required for the 3PL role");
      }
      await this.upsertThreePlProfile(user.id, dto.threePlProfile);
    }

    const paidRoles = dto.roles.filter((r) => PAID_ROLES.includes(r));
    if (paidRoles.length > 0) {
      await this.billingService.ensureSeatBilling(user.id);
      for (const role of paidRoles) {
        await this.billingService.grantFreeSeatIfAvailable(companyId, user.id, role);
      }
    }

    await this.sendInviteEmail(user, companyId);

    return this.get(companyId, user.id);
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException("User not found");
    if (dto.name !== undefined) {
      user.name = dto.name;
    }
    await user.save();
    return this.toDto(await user.reload({ include: PROFILE_INCLUDES }));
  }

  async updateUser(companyId: string, userId: string, dto: UpdateOwnProfileDto) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException("User not found");
    if (dto.name !== undefined) {
      user.name = dto.name;
    }
    await user.save();
    return this.toDto(await user.reload({ include: PROFILE_INCLUDES }));
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException("Passwords do not match");
    }

    const user = await this.userModel.scope("withPassword").findByPk(userId);
    if (!user) throw new NotFoundException("User not found");
    if (!user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await user.save();
    return { message: "Password updated" };
  }

  async setStatus(companyId: string, userId: string, status: UserStatus) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException("User not found");
    user.status = status;
    await user.save();
    return this.toDto(await user.reload({ include: PROFILE_INCLUDES }));
  }

  async upsertStaffProfile(userId: string, input: StaffPermissionsInput) {
    const [profile] = await this.staffProfileModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      canManageOrders: input.canManageOrders,
      canManageStock: input.canManageStock,
      canManageUsers: input.canManageUsers,
      canGenerateInvoices: input.canGenerateInvoices,
      canViewFinancials: input.canViewFinancials,
      hasRevenueShare: input.hasRevenueShare,
      sharePercent: input.hasRevenueShare ? (input.sharePercent ?? 0) : null,
    });
    await profile.save();
    return profile;
  }

  async upsertAccountHolderProfile(userId: string, input: AccountHolderProfileInput) {
    const [profile] = await this.accountHolderModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      sharePercent: input.sharePercent,
      threePlPriceCharged: input.threePlPriceCharged ?? null,
      billingCycleStartDay: input.billingCycleStartDay,
    });
    await profile.save();
    return profile;
  }

  async upsertStockOwnerProfile(userId: string, input: StockOwnerProfileInput) {
    const [profile] = await this.stockOwnerModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      payoutMode: input.payoutMode,
      sharePercent: input.sharePercent ?? null,
      billingCycleStartDay: input.billingCycleStartDay,
    });
    await profile.save();
    return profile;
  }

  async upsertThreePlProfile(userId: string, input: ThreePlProfileInput) {
    const [profile] = await this.threePlModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      // DROPSHIP 3PLs have no configured rate — they're paid the buy price entered per order instead.
      payoutPerOrder: input.fulfillmentType === ProductFulfillmentType.STOCK ? (input.payoutPerOrder ?? 0) : 0,
      billingCycleStartDay: input.billingCycleStartDay,
      fulfillmentType: input.fulfillmentType,
    });
    await profile.save();
    return profile;
  }

  // All invitable roles (STAFF, ACCOUNT_HOLDER, STOCK_OWNER, THREE_PL) live in the portal `users`
  // table and sign in via the partner portal, never the backoffice.
  private async sendInviteEmail(user: User, companyId: string) {
    const record = await this.tokensService.issue({
      email: user.email,
      companyId,
      userId: user.id,
      purpose: TokenPurpose.USER_INVITE,
    });

    const url = `${this.config.get<string>("PORTAL_URL")}/accept-invite?token=${record.token}`;

    await this.mailer.send(
      user.email,
      "You've been invited",
      `<p>You've been invited to join. Click to set your password: <a href="${url}">${url}</a></p><p>This link expires in 7 days.</p>`,
    );
  }
}

function defaultStaffPermissions(): StaffPermissionsInput {
  return {
    canManageOrders: false,
    canManageStock: false,
    canManageUsers: false,
    canGenerateInvoices: false,
    canViewFinancials: false,
    hasRevenueShare: false,
  };
}
