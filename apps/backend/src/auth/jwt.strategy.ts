import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role } from "@ebay-order-management/shared";

export interface JwtPayload {
  sub: string;
  companyId: string | null;
  email: string;
  roles: Role[];
  /** Which identity table `sub` refers to — determines how guards resolve permissions/company scope. */
  realm: "backoffice" | "portal";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") ?? "change-me",
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
