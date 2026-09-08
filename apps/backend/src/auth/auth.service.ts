import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/sequelize";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { Role, TokenPurpose, UserStatus } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeUser } from "../database/models/backoffice-user.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { MailerService } from "../mailer/mailer.service";
import { TokensService } from "../tokens/tokens.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { JwtPayload } from "./jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(UserRoleAssignment) private readonly userRoleModel: typeof UserRoleAssignment,
    @InjectModel(BackofficeUser) private readonly backofficeUserModel: typeof BackofficeUser,
    @InjectModel(BackofficeStaffProfile) private readonly backofficeStaffProfileModel: typeof BackofficeStaffProfile,
    private readonly jwtService: JwtService,
    private readonly tokensService: TokensService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException("Passwords do not match");
    }

    const existing = await this.userModel.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const company = await this.companyModel.create({ name: dto.companyName });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      companyId: company.id,
      email: dto.email,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    await this.userRoleModel.create({ userId: user.id, role: Role.ADMIN });

    await this.sendVerificationEmail(dto.email, company.id);

    return { companyId: company.id, userId: user.id };
  }

  async resendVerification(email: string) {
    const company = await this.findCompanyByAdminEmail(email);
    if (company.emailVerifiedAt) {
      throw new BadRequestException("This company is already verified");
    }
    await this.sendVerificationEmail(email, company.id);
    return { message: "Verification email sent" };
  }

  async verifyEmail(token: string) {
    const record = await this.tokensService.consume(token, TokenPurpose.EMAIL_VERIFY);
    const company = record.companyId ? await this.companyModel.findByPk(record.companyId) : null;
    if (!company) {
      throw new BadRequestException("Company not found");
    }
    company.emailVerifiedAt = new Date();
    await company.save();
    return { message: "Email verified" };
  }

  async login(dto: LoginDto) {
    if (dto.context === "backoffice") {
      return this.loginBackoffice(dto.email, dto.password);
    }
    return this.loginPortal(dto.email, dto.password);
  }

  private async loginPortal(email: string, password: string) {
    const user = await this.userModel.scope("withPassword").findOne({
      where: { email },
      include: [UserRoleAssignment, StaffProfile],
    });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("This account is not active");
    }

    const company = user.companyId ? await this.companyModel.findByPk(user.companyId) : null;
    if (!company?.emailVerifiedAt) {
      throw new UnauthorizedException("Please verify your company's email before logging in");
    }

    const roles = user.roleAssignments.map((r) => r.role);

    const payload: JwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      roles,
      realm: "portal",
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        companyId: user.companyId,
        roles,
        staffPermissions: user.staffProfile
          ? {
              canManageOrders: user.staffProfile.canManageOrders,
              canManageStock: user.staffProfile.canManageStock,
              canManageUsers: user.staffProfile.canManageUsers,
              canGenerateInvoices: user.staffProfile.canGenerateInvoices,
              canViewFinancials: user.staffProfile.canViewFinancials,
            }
          : null,
      },
    };
  }

  private async loginBackoffice(email: string, password: string) {
    const user = await this.backofficeUserModel.scope("withPassword").findOne({
      where: { email },
      include: [BackofficeStaffProfile],
    });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("This account is not active");
    }

    const roles = [user.role];

    const payload: JwtPayload = {
      sub: user.id,
      companyId: null,
      email: user.email,
      roles,
      realm: "backoffice",
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        companyId: null,
        roles,
        staffPermissions: user.backofficeStaffProfile
          ? {
              canManageOrders: user.backofficeStaffProfile.canManageOrders,
              canManageStock: user.backofficeStaffProfile.canManageStock,
              canManageUsers: user.backofficeStaffProfile.canManageUsers,
              canGenerateInvoices: user.backofficeStaffProfile.canGenerateInvoices,
              canViewFinancials: user.backofficeStaffProfile.canViewFinancials,
            }
          : null,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const portalUser = await this.userModel.findOne({ where: { email: dto.email } });
    if (portalUser) {
      const record = await this.tokensService.issue({
        email: dto.email,
        companyId: portalUser.companyId,
        userId: portalUser.id,
        purpose: TokenPurpose.PASSWORD_RESET,
      });
      const url = `${this.config.get<string>("PORTAL_URL")}/reset-password?token=${record.token}`;
      await this.mailer.send(
        dto.email,
        "Reset your password",
        `<p>Click to reset your password: <a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`,
      );
      return { message: "If that email exists, a reset link has been sent" };
    }

    const backofficeUser = await this.backofficeUserModel.findOne({ where: { email: dto.email } });
    if (backofficeUser) {
      const record = await this.tokensService.issue({
        email: dto.email,
        companyId: null,
        backofficeUserId: backofficeUser.id,
        purpose: TokenPurpose.PASSWORD_RESET,
      });
      const url = `${this.config.get<string>("BACKOFFICE_URL")}/reset-password?token=${record.token}`;
      await this.mailer.send(
        dto.email,
        "Reset your password",
        `<p>Click to reset your password: <a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`,
      );
    }

    // Do not reveal whether the email exists.
    return { message: "If that email exists, a reset link has been sent" };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException("Passwords do not match");
    }

    const record = await this.tokensService.consume(dto.token, TokenPurpose.PASSWORD_RESET);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    if (record.backofficeUserId) {
      const user = await this.backofficeUserModel.findByPk(record.backofficeUserId);
      if (!user) throw new BadRequestException("User not found");
      user.passwordHash = passwordHash;
      await user.save();
      return { message: "Password updated" };
    }

    const user = record.userId ? await this.userModel.findByPk(record.userId) : null;
    if (!user) {
      throw new BadRequestException("User not found");
    }
    user.passwordHash = passwordHash;
    await user.save();

    return { message: "Password updated" };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException("Passwords do not match");
    }

    const record = await this.tokensService.consume(dto.token, TokenPurpose.USER_INVITE);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    if (record.backofficeUserId) {
      const user = await this.backofficeUserModel.findByPk(record.backofficeUserId);
      if (!user) throw new BadRequestException("User not found");
      user.passwordHash = passwordHash;
      user.status = UserStatus.ACTIVE;
      await user.save();
      return { message: "Account activated, you can now log in" };
    }

    const user = record.userId ? await this.userModel.findByPk(record.userId) : null;
    if (!user) {
      throw new BadRequestException("User not found");
    }

    user.passwordHash = passwordHash;
    user.status = UserStatus.ACTIVE;
    await user.save();

    return { message: "Account activated, you can now log in" };
  }

  private async findCompanyByAdminEmail(email: string): Promise<Company> {
    const user = await this.userModel.findOne({ where: { email } });
    if (!user || !user.companyId) {
      throw new BadRequestException("No company found for this email");
    }
    const company = await this.companyModel.findByPk(user.companyId);
    if (!company) {
      throw new BadRequestException("Company not found");
    }
    return company;
  }

  private async sendVerificationEmail(email: string, companyId: string) {
    const record = await this.tokensService.issue({
      email,
      companyId,
      purpose: TokenPurpose.EMAIL_VERIFY,
    });

    const url = `${this.config.get<string>("PORTAL_URL")}/verify-email?token=${record.token}`;
    await this.mailer.send(
      email,
      "Verify your company email",
      `<p>Click to verify your email: <a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`,
    );
  }
}
