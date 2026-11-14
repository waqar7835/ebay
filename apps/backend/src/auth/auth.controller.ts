import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyEmailDto, VerifyEmailCodeDto, ResendVerificationDto } from "./dto/verify-email.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { RATE_WINDOW, RateLimitService, emailKey } from "../common/rate-limit.service";

/**
 * Logged-out endpoints, rate limited (security audit 2026-11-13): per email where there is one (works the same behind
 * any proxy) plus a looser per-IP cap. The failed-login lockout per email lives in AuthService.login.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    this.rateLimit.hit(`register:ip:${req.ip}`, 10, RATE_WINDOW.HOUR);
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    this.rateLimit.hit(`login:ip:${req.ip}`, 30, RATE_WINDOW.MINUTE);
    return this.authService.login(dto);
  }

  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    this.rateLimit.hit(`verify-token:ip:${req.ip}`, 20, RATE_WINDOW.TEN_MINUTES);
    return this.authService.verifyEmail(dto.token);
  }

  @Post("verify-email-code")
  verifyEmailCode(@Body() dto: VerifyEmailCodeDto, @Req() req: Request) {
    this.rateLimit.hit(`verify-code:ip:${req.ip}`, 20, RATE_WINDOW.TEN_MINUTES);
    this.rateLimit.hit(`verify-code:email:${emailKey(dto.email)}`, 5, RATE_WINDOW.TEN_MINUTES);
    return this.authService.verifyEmailByCode(dto.email, dto.code);
  }

  @Post("resend-verification")
  resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    this.rateLimit.hit(`send-email:ip:${req.ip}`, 10, RATE_WINDOW.FIFTEEN_MINUTES);
    this.rateLimit.hit(`resend-verification:email:${emailKey(dto.email)}`, 3, RATE_WINDOW.FIFTEEN_MINUTES);
    return this.authService.resendVerification(dto.email);
  }

  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    this.rateLimit.hit(`send-email:ip:${req.ip}`, 10, RATE_WINDOW.FIFTEEN_MINUTES);
    this.rateLimit.hit(`forgot-password:email:${emailKey(dto.email)}`, 3, RATE_WINDOW.FIFTEEN_MINUTES);
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    this.rateLimit.hit(`token-use:ip:${req.ip}`, 20, RATE_WINDOW.HOUR);
    return this.authService.resetPassword(dto);
  }

  @Post("accept-invite")
  acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: Request) {
    this.rateLimit.hit(`token-use:ip:${req.ip}`, 20, RATE_WINDOW.HOUR);
    return this.authService.acceptInvite(dto);
  }
}
