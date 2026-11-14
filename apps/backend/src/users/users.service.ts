import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/sequelize";
import * as bcrypt from "bcrypt";
import { Op, Sequelize } from "sequelize";
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
import { Expense } from "../database/models/expense.model";
import { ProfitStatement } from "../database/models/profit-statement.model";
import { MailerService } from "../mailer/mailer.service";
import { TokensService } from "../tokens/tokens.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { Paging } from "../common/pagination.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { isCoAdmin, isRealAdmin } from "../common/admin-access.util";
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

const STAFF_PERMISSION_KEYS = ["canManageOrders", "canManageStock", "canManageUsers", "canGenerateInvoices", "canViewFinancials"] as const;

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
    @InjectModel(Expense) private readonly expenseModel: typeof Expense,
    @InjectModel(ProfitStatement) private readonly profitStatementModel: typeof ProfitStatement,
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

  async invite(companyId: string, inviter: JwtPayload, dto: InviteUserDto, canSetPartner = false) {
    const grantsPermissions = dto.staffPermissions && STAFF_PERMISSION_KEYS.some((k) => dto.staffPermissions![k]);
    if (grantsPermissions && inviter.realm === "portal" && !inviter.roles.includes(Role.ADMIN)) {
      throw new ForbiddenException("Only the company Admin can give Staff permissions — invite without them and ask the Admin");
    }
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
      await this.upsertStaffProfile(companyId, user.id, dto.staffPermissions ?? defaultStaffPermissions(), canSetPartner);
    }
    if (dto.roles.includes(Role.ACCOUNT_HOLDER)) {
      if (!dto.accountHolderProfile) {
        throw new BadRequestException("accountHolderProfile is required for the Account Holder role");
      }
      await this.upsertAccountHolderProfile(companyId, user.id, dto.accountHolderProfile);
    }
    if (dto.roles.includes(Role.STOCK_OWNER)) {
      if (!dto.stockOwnerProfile) {
        throw new BadRequestException("stockOwnerProfile is required for the Stock Owner role");
      }
      await this.upsertStockOwnerProfile(companyId, user.id, dto.stockOwnerProfile);
    }
    if (dto.roles.includes(Role.THREE_PL)) {
      if (!dto.threePlProfile) {
        throw new BadRequestException("threePlProfile is required for the 3PL role");
      }
      await this.upsertThreePlProfile(companyId, user.id, dto.threePlProfile);
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
    // Existing orders keep the currency on them until the manager recomputes them (recompute-orders-currency).
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
    // Ends every other login of this account; the controller hands this session a fresh token.
    user.sessionVersion += 1;
    await user.save();
    return { message: "Password updated", sessionVersion: user.sessionVersion };
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
      user.sessionVersion += 1;
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
      (await this.productModel.count({
        where: {
          [Op.or]: [
            { stockOwnerId: userId },
            // A 3PL holding stock of any product (product_stocks).
            { id: { [Op.in]: Sequelize.literal(`(SELECT product_id FROM product_stocks WHERE three_pl_id = ${this.productModel.sequelize!.escape(userId)})`) } },
          ],
        },
      })) +
      (await this.invoiceModel.count({ where: { [Op.or]: [{ userId }, { generatedByUserId: userId }] } })) +
      (await this.expenseModel.count({ where: { [Op.or]: [{ chargedToUserId: userId }, { createdByUserId: userId }] } })) +
      (await this.profitStatementModel.count({ where: { generatedByUserId: userId } }));
    if (history > 0) {
      throw new ConflictException("This user has orders, products, invoices or expenses, so they can't be deleted — disable them instead");
    }

    await user.destroy();
    return { deleted: true };
  }

  /**
   * Who may change another account through the /users/:id routes (decided 2026-11-13). The guard already requires the
   * Admin (or a partner with Admin access, who acts as one) or Staff with canManageUsers. On top of that:
   * - the company Admin's account: only the Admin itself (and it can never be disabled or deleted);
   * - a partner's account: only the real Admin;
   * - your own account: never here (use your profile page);
   * - Staff permissions: only the Admin or a partner with Admin access (`ADMIN` in the effective roles).
   * The backoffice (platform oversight) is exempt.
   */
  async assertCanChange(companyId: string, actor: JwtPayload, targetId: string, action: "edit" | "status" | "delete" | "permissions") {
    const target = await this.userModel.findOne({
      where: { id: targetId, companyId },
      attributes: ["id"],
      include: [UserRoleAssignment, { model: this.staffProfileModel, attributes: ["userId", "isPartner"] }],
    });
    if (!target) throw new NotFoundException("User not found");
    const targetRoles = target.roleAssignments.map((r) => r.role);
    // Platform oversight (Super Admin / Platform Staff) isn't bound by the company's internal rules; the service itself
    // still refuses disabling or deleting the company Admin.
    if (actor.realm === "backoffice") {
      if (action === "permissions" && !targetRoles.includes(Role.STAFF)) throw new BadRequestException("This user isn't Staff");
      return;
    }
    if (targetRoles.includes(Role.ADMIN)) {
      if (action !== "edit" || !isRealAdmin(actor) || actor.sub !== targetId) {
        throw new ForbiddenException("The company Admin's account can only be changed by the Admin");
      }
      return;
    }
    if (actor.sub === targetId) throw new ForbiddenException("You can't change your own account here — use your profile page");
    if (target.staffProfile?.isPartner && !isRealAdmin(actor)) {
      throw new ForbiddenException("Only the company Admin can change a partner's account");
    }
    if (action === "permissions") {
      if (actor.realm === "portal" && !actor.roles.includes(Role.ADMIN)) {
        throw new ForbiddenException("Only the company Admin can change Staff permissions");
      }
      if (!targetRoles.includes(Role.STAFF)) throw new BadRequestException("This user isn't Staff");
    }
  }

  /**
   * `canSetPartner`: only the company Admin marks partners / sets their % and statement permission (2026-11-05); for
   * anyone else (Staff with canManageUsers) those fields are left as they are.
   */
  async upsertStaffProfile(companyId: string, userId: string, input: StaffPermissionsInput, canSetPartner = false) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, attributes: ["id", "sessionVersion"] });
    if (!user) throw new NotFoundException("User not found");
    const [profile] = await this.staffProfileModel.findOrCreate({ where: { userId }, defaults: { userId } });
    const wasCoAdmin = isCoAdmin(profile);
    if (canSetPartner) {
      const partnerPercent = input.isPartner ? round2(input.partnerPercent ?? 0) : null;
      if (partnerPercent !== null) await this.assertSplitFits(companyId, userId, partnerPercent);
      Object.assign(profile, {
        isPartner: input.isPartner,
        partnerPercent,
        canManageProfitStatements: input.isPartner ? !!input.canManageProfitStatements : false,
        // Admin access only for partners (2026-11-13); taking it away applies on the partner's next request.
        hasAdminAccess: input.isPartner ? !!input.hasAdminAccess : false,
      });
    }
    Object.assign(profile, {
      canManageOrders: input.canManageOrders,
      canManageStock: input.canManageStock,
      canManageUsers: input.canManageUsers,
      canGenerateInvoices: input.canGenerateInvoices,
      canViewFinancials: input.canViewFinancials,
    });
    await profile.save();
    // Gaining or losing Admin access changes the roles the portal shows, which it reads at login: end the partner's
    // sessions so it signs in again with the right screens (the API applies it on the next request either way).
    if (isCoAdmin(profile) !== wasCoAdmin) {
      user.sessionVersion += 1;
      await user.save();
    }
    return profile;
  }

  /** Admin % + every partner's % (this user's as `percent`) can't go over 100 — the company gets the rest. */
  private async assertSplitFits(companyId: string, userId: string, percent: number) {
    const company = await this.companyModel.findByPk(companyId, { attributes: ["id", "adminProfitPercent"] });
    const others = await this.staffProfileModel.findAll({
      where: { isPartner: true, userId: { [Op.ne]: userId } },
      include: [{ model: this.userModel, where: { companyId }, attributes: [] }],
    });
    const total = round2((company?.adminProfitPercent ?? 0) + others.reduce((sum, p) => sum + (p.partnerPercent ?? 0), 0) + percent);
    if (total > 100) {
      throw new BadRequestException(
        `The Admin and partners would get ${total}% of the profit — it can't be more than 100%. Lower someone's % first.`,
      );
    }
  }

  /**
   * Profile terms can only be set on a user of this company who holds that role (security audit 2026-11-13: these
   * routes used to take any user id, so one company could rewrite another's share / payout terms).
   */
  private async assertCompanyUserWithRole(companyId: string, userId: string, role: Role, label: string) {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, include: [UserRoleAssignment] });
    if (!user) throw new NotFoundException("User not found");
    if (!user.roleAssignments.some((r) => r.role === role)) throw new BadRequestException(`This user isn't ${label}`);
  }

  async upsertAccountHolderProfile(companyId: string, userId: string, input: AccountHolderProfileInput) {
    await this.assertCompanyUserWithRole(companyId, userId, Role.ACCOUNT_HOLDER, "an Account Holder");
    const [profile] = await this.accountHolderModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      sharePercent: input.sharePercent,
      threePlPriceCharged: input.threePlPriceCharged ?? null,
      billingCycleStartDay: input.billingCycleStartDay,
    });
    await profile.save();
    return profile;
  }

  async upsertStockOwnerProfile(companyId: string, userId: string, input: StockOwnerProfileInput) {
    await this.assertCompanyUserWithRole(companyId, userId, Role.STOCK_OWNER, "a Stock Owner");
    const [profile] = await this.stockOwnerModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      payoutMode: input.payoutMode,
      sharePercent: input.sharePercent ?? null,
      billingCycleStartDay: input.billingCycleStartDay,
    });
    await profile.save();
    return profile;
  }

  async upsertThreePlProfile(companyId: string, userId: string, input: ThreePlProfileInput) {
    await this.assertCompanyUserWithRole(companyId, userId, Role.THREE_PL, "a 3PL");
    const [profile] = await this.threePlModel.findOrCreate({ where: { userId }, defaults: { userId } });
    Object.assign(profile, {
      // DROPSHIP 3PLs have no configured rate — they're paid the buy price entered per order instead.
      payoutPerOrder: input.fulfillmentType === ProductFulfillmentType.STOCK ? (input.payoutPerOrder ?? 0) : 0,
      billingCycleStartDay: input.billingCycleStartDay,
      fulfillmentType: input.fulfillmentType,
    });
    // Only used on dropship orders; new orders lock the current value, existing ones keep theirs.
    if (input.dropshipDiscountPercent !== undefined) profile.dropshipDiscountPercent = input.dropshipDiscountPercent;
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
    isPartner: false,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
