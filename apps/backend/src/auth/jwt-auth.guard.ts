import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Error code the apps watch for to send the user back to the login page (missing, expired or invalid token). */
export const SESSION_EXPIRED = "SESSION_EXPIRED";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  // Tagged so the apps can tell a dead session from other 401s (e.g. a wrong current password).
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: SESSION_EXPIRED,
        message: "Your session has expired. Please log in again.",
      });
    }
    return user;
  }
}
