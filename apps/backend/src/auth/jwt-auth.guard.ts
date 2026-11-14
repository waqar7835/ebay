import { HttpException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Error code the apps watch for to send the user back to the login page (missing, expired or invalid token). */
export const SESSION_EXPIRED = "SESSION_EXPIRED";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  // Tagged so the apps can tell a dead session from other 401s (e.g. a wrong current password).
  // A server-side failure while checking the token (e.g. the database is briefly unreachable, 503 from JwtStrategy)
  // passes through as is, so the apps show an error instead of logging the user out.
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err instanceof HttpException && err.getStatus() >= 500) throw err;
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
