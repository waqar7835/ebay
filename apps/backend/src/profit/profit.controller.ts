import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ProfitService } from "./profit.service";
import { ExpensesService } from "./expenses.service";
import {
  ExpenseCategoryInputDto,
  ExpenseInputDto,
  GenerateProfitStatementDto,
  ProfitSplitSettingsInputDto,
} from "./dto/profit.dto";

/**
 * Profit split, expenses and profit statements (2026-11-05). Portal only; who may do what (Admin / partner / partner
 * with statement permission) is checked in the services via ProfitAccessService.
 */
@ApiTags("profit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProfitController {
  constructor(
    private readonly profit: ProfitService,
    private readonly expenses: ExpensesService,
  ) {}

  @Get("profit/split")
  settings(@CurrentUser() user: JwtPayload) {
    return this.profit.settings(resolveCompanyId(user), user);
  }

  @Put("profit/split")
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: ProfitSplitSettingsInputDto) {
    return this.profit.updateSettings(resolveCompanyId(user), user, dto);
  }

  @Get("profit/cycles")
  overview(@CurrentUser() user: JwtPayload) {
    return this.profit.overview(resolveCompanyId(user), user);
  }

  @Get("profit/current")
  async current(@CurrentUser() user: JwtPayload) {
    return { cycle: await this.profit.current(resolveCompanyId(user), user) };
  }

  @Get("profit/cycles/:start")
  cycle(@CurrentUser() user: JwtPayload, @Param("start") start: string) {
    return this.profit.cycle(resolveCompanyId(user), user, start);
  }

  /** DRAFT PDF of a cycle with no statement yet (a generated cycle returns its statement). `userId` = one person's. */
  @Get("profit/cycles/:start/pdf")
  async previewPdf(@CurrentUser() user: JwtPayload, @Param("start") start: string, @Query("userId") userId?: string) {
    const { buffer, filename } = await this.profit.previewPdf(resolveCompanyId(user), user, start, userId || undefined);
    return new StreamableFile(buffer, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Post("profit-statements")
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateProfitStatementDto) {
    return this.profit.generate(resolveCompanyId(user), user, dto.cycleStart);
  }

  @Get("profit-statements/:id/pdf")
  async pdf(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("userId") userId?: string) {
    const { buffer, filename } = await this.profit.pdf(resolveCompanyId(user), user, id, userId || undefined);
    return new StreamableFile(buffer, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Delete("profit-statements/:id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.profit.remove(resolveCompanyId(user), user, id);
  }

  // ----- Expenses

  @Get("expenses")
  listExpenses(@CurrentUser() user: JwtPayload, @Query("from") from?: string, @Query("to") to?: string) {
    return this.expenses.list(resolveCompanyId(user), user, from, to);
  }

  @Post("expenses")
  createExpense(@CurrentUser() user: JwtPayload, @Body() dto: ExpenseInputDto) {
    return this.expenses.create(resolveCompanyId(user), user, dto);
  }

  @Patch("expenses/:id")
  updateExpense(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ExpenseInputDto) {
    return this.expenses.update(resolveCompanyId(user), user, id, dto);
  }

  @Delete("expenses/:id")
  removeExpense(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.expenses.remove(resolveCompanyId(user), user, id);
  }

  @Get("expense-categories")
  categories(@CurrentUser() user: JwtPayload) {
    return this.expenses.categories(resolveCompanyId(user), user);
  }

  @Post("expense-categories")
  createCategory(@CurrentUser() user: JwtPayload, @Body() dto: ExpenseCategoryInputDto) {
    return this.expenses.createCategory(resolveCompanyId(user), user, dto);
  }

  @Patch("expense-categories/:id")
  renameCategory(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ExpenseCategoryInputDto) {
    return this.expenses.renameCategory(resolveCompanyId(user), user, id, dto);
  }

  @Delete("expense-categories/:id")
  removeCategory(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.expenses.removeCategory(resolveCompanyId(user), user, id);
  }
}
