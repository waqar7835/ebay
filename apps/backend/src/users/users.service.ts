import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/sequelize";
import * as bcrypt from "bcrypt";
import { Op } from "sequelize";
import { DEFAULT_CURRENCY, ProductFulfillmentType, Role, TokenPurpose, UserStatus } from "@ebay-order-management/shared";
import { User } from "../database/models/user.model";
import { Company } from "../database/models/company.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Product } from "../database/models/product.model";
import { Invoice } from "../database/models/invoice.model";
import { MailerService } from "../mailer/mailer.service";
import { TokensService } from "../tokens/tokens.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { Paging } from "../common/pagination.util";
import {
  AccountHolderProfileInput,
  InviteUserDto,
  StaffPermissionsInput,
  StockOwnerProfileInput,
  ThreePlProfileInput,
} from "./dto/invite-user.dto";
import { ChangePasswordDto, UpdateOwnProfileDto, UpdateUserDto } from "./dto/update-own-profile.dto";

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
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(UserRoleAssignment) private readonly userRoleModel: typeof UserRoleAssignment,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(AccountHolderProfile) private readonly accountHolderModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlModel: typeof ThreePlProfile,
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderItem) private readonly orderItemModel: typeof OrderItem,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    private readonly tokensService: TokensService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Whole list (pickers) when `paging` is null, otherwise one page (newest first) with the total. */
  async list(companyId: string, paging: Paging | null = null) {
    if (!paging) {
      const users = await this.userModel.findAll({ where: { companyId }, include: PROFILE_INCLUDES });
      return users.map((u) => this.toDto(u));
    }
    // distinct: the hasMany role rows would otherwise inflate the count; id breaks createdAt ties so pages never overlap.
    const { rows, count } = await this.userModel.findAndCountAll({
      where: { companyId },
      include: PROFILE_INCLUDES,
      distinct: true,
      order: [
        ["createdAt", "DESC"],
        ["id", "ASC"],
      ],
      limit: paging.pageSize,
      offset: paging.offset,
    });
    const subscriptionDisabled = await this.userModel.count({
      where: { companyId, status: UserStatus.DISABLED, disabledBySubscription: true },
    });
    return { data: rows.map((u) => this.toDto(u)), total: count, page: paging.page, pageSize: paging.pageSize, subscriptionDisabled };
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
      avatarUrl: user.avatarUrl,
      status: user.status,
      disabledBySubscription: user.disabledBySubscription,
      currency: user.currency,
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
    await this.subscriptions.assertSeatsAvailable(companyId, dto.roles);

    const user = await this.userModel.create({
      companyId,
      name: dto.name ?? null,
      email: dto.email,
      status: UserStatus.INVITED,
      currency: dto.currency ?? (await this.companyModel.findByPk(companyId))?.defaultCurrency ?? DEFAULT_CURRENCY,
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

  async updateUser(companyId: string, userId: string, dto: UpdateUserDto) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException("User not found");
    if (dto.name !== undefined) {
      user.name = dto.name;
    }
    // Existing orders keep the currency snapshotted on them; only new orders use the new one.
    if (dto.currency !== undefined) {
      user.currency = dto.currency;
    }
    await user.save();
    return this.toDto(await user.reload({ include: PROFILE_INCLUDES }));
  }

  async setAvatar(companyId: string, userId: string, avatarUrl: string) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException("User not found");
    user.avatarUrl = avatarUrl;
    await user.save();
    return this.get(companyId, userId);
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

  /**
   * Enabling makes an INVITED or DISABLED account ACTIVE (decided 2026-10-12). Re-enabling a
   * disabled account needs a free seat on the company's plan (an invited one already holds one).
   * An account that never accepted its invite keeps the placeholder invite password, so it can sign
   * in with it until it's changed; it's stamped as accepted so a subscription renewal keeps it ACTIVE.
   */
  async setEnabled(companyId: string, userId: string, enabled: boolean) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, include: [UserRoleAssignment] });
    if (!user) throw new NotFoundException("User not found");
    const roles = user.roleAssignments.map((r) => r.role);
    if (roles.includes(Role.ADMIN)) throw new BadRequestException("The company Admin can't be disabled");
    if (enabled) {
      if (user.status === UserStatus.ACTIVE) return this.get(companyId, userId);
      if (user.status === UserStatus.DISABLED) await this.subscriptions.assertSeatsAvailable(companyId, roles, user.id);
      user.status = UserStatus.ACTIVE;
      user.inviteAcceptedAt ??= new Date();
    } else {
      user.status = UserStatus.DISABLED;
    }
    user.disabledBySubscription = false;
    await user.save();
    return this.toDto(await user.reload({ include: PROFILE_INCLUDES }));
  }

  /**
   * Hard-deletes an account that has no history. Anyone on an order, product or invoice is kept
   * (deleting would cascade their invoices away or orphan orders) — disable them instead.
   */
  async remove(companyId: string, userId: string, actingUserId: string) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, include: [UserRoleAssignment] });
    if (!user) throw new NotFoundException("User not found");
    if (user.roleAssignments.some((r) => r.role === Role.ADMIN)) throw new BadRequestException("The company Admin can't be deleted");
    if (user.id === actingUserId) throw new BadRequestException("You can't delete your own account");

    const history =
      (await this.orderModel.unscoped().count({ where: { [Op.or]: [{ accountHolderId: userId }, { threePlId: userId }] } })) +
      (await this.orderItemModel.count({ where: { stockOwnerId: userId } })) +
      (await this.productModel.count({ where: { [Op.or]: [{ stockOwnerId: userId }, { threePlId: userId }] } })) +
      (await this.invoiceModel.count({ where: { [Op.or]: [{ userId }, { generatedByUserId: userId }] } }));
    if (history > 0) {
      throw new ConflictException("This user has orders, products or invoices, so they can't be deleted — disable them instead");
    }

    await user.destroy();
    return { deleted: true };
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
    // Auto-delivery: left as it is when not sent. Switching it on stamps the time, so only orders shipped from now on
    // are auto-delivered; changing the days keeps that time.
    if (input.autoDeliveryEnabled !== undefined) {
      if (input.autoDeliveryEnabled && !profile.autoDeliveryEnabled) profile.autoDeliveryEnabledAt = new Date();
      profile.autoDeliveryEnabled = input.autoDeliveryEnabled;
      profile.deliveryDays = input.autoDeliveryEnabled ? (input.deliveryDays ?? null) : null;
      if (!input.autoDeliveryEnabled) profile.autoDeliveryEnabledAt = null;
    }
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
