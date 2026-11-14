import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PublicService } from "./public.service";
import { ContactMessageDto } from "./dto/contact.dto";

/** No auth: used by the logged-out marketing pages. */
@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /** Active plans and billing periods for the Pricing page. */
  @Get("pricing")
  pricing() {
    return this.publicService.pricing();
  }

  /** Brand name, logo and public contact details for the marketing pages. */
  @Get("site")
  site() {
    return this.publicService.site();
  }

  @Post("contact")
  @HttpCode(200)
  contact(@Body() dto: ContactMessageDto, @Req() req: Request) {
    // req.ip follows TRUST_PROXY (main.ts), so a spoofed X-Forwarded-For can't dodge the limit.
    return this.publicService.contact(dto, req.ip || "unknown");
  }
}
