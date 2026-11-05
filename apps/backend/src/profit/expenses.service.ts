import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { ExpenseCategoryDto, ExpenseChargedTo, ExpenseDto, Role } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { Expense } from "../database/models/expense.model";
import { ExpenseCategory } from "../database/models/expense-category.model";
import { ProfitStatement } from "../database/models/profit-statement.model";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ProfitAccess, ProfitAccessService } from "./profit-access.service";
import { ExpenseCategoryInputDto, ExpenseInputDto } from "./dto/profit.dto";

/**
 * Expenses (2026-11-05), PKR. The Admin charges an expense to the company, themselves or any partner; a partner only to
 * themselves or the company. The Admin edits / deletes any expense, a partner only the ones they added. An expense's
 * date picks its billing cycle; once that cycle has a profit statement the expense is frozen.
 */
@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(Expense) private readonly expenseModel: typeof Expense,
    @InjectModel(ExpenseCategory) private readonly categoryModel: typeof ExpenseCategory,
    @InjectModel(ProfitStatement) private readonly statementModel: typeof ProfitStatement,
    private readonly accessService: ProfitAccessService,
  ) {}

  async list(companyId: string, requester: JwtPayload, from?: string, to?: string): Promise<ExpenseDto[]> {
    await this.accessService.resolve(requester);
    const where: Record<string, unknown> = { companyId };
    if (from && to) where.expenseDate = { [Op.between]: [from, to] };
    const expenses = await this.expenseModel.findAll({
      where,
      include: this.includes(),
      order: [
        ["expenseDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    });
    return expenses.map(toDto);
  }

  async create(companyId: string, requester: JwtPayload, input: ExpenseInputDto) {
    const access = await this.accessService.resolve(requester);
    const values = await this.validate(companyId, access, input);
    const expense = await this.expenseModel.create({ ...values, companyId, createdByUserId: access.userId });
    return this.get(companyId, expense.id);
  }

  async update(companyId: string, requester: JwtPayload, id: string, input: ExpenseInputDto) {
    const access = await this.accessService.resolve(requester);
    const expense = await this.findEditable(companyId, access, id);
    const values = await this.validate(companyId, access, input);
    Object.assign(expense, values);
    await expense.save();
    return this.get(companyId, id);
  }

  async remove(companyId: string, requester: JwtPayload, id: string) {
    const access = await this.accessService.resolve(requester);
    const expense = await this.findEditable(companyId, access, id);
    await expense.destroy();
    return { id, deleted: true };
  }

  // ----- Categories (Admin-managed)

  async categories(companyId: string, requester: JwtPayload): Promise<ExpenseCategoryDto[]> {
    await this.accessService.resolve(requester);
    const rows = await this.categoryModel.findAll({
      where: { companyId },
      order: [
        ["position", "ASC"],
        ["name", "ASC"],
      ],
    });
    return rows.map((c) => ({ id: c.id, name: c.name, position: c.position }));
  }

  async createCategory(companyId: string, requester: JwtPayload, input: ExpenseCategoryInputDto) {
    await this.accessService.assertAdmin(requester);
    const position = ((await this.categoryModel.max("position", { where: { companyId } })) as number | null) ?? -1;
    await this.categoryModel.create({ companyId, name: input.name.trim(), position: position + 1 });
    return this.categories(companyId, requester);
  }

  async renameCategory(companyId: string, requester: JwtPayload, id: string, input: ExpenseCategoryInputDto) {
    await this.accessService.assertAdmin(requester);
    const category = await this.categoryModel.findOne({ where: { id, companyId } });
    if (!category) throw new NotFoundException("Category not found");
    category.name = input.name.trim();
    await category.save();
    return this.categories(companyId, requester);
  }

  /** Expenses in a deleted category keep their amounts and just lose the category. */
  async removeCategory(companyId: string, requester: JwtPayload, id: string) {
    await this.accessService.assertAdmin(requester);
    const category = await this.categoryModel.findOne({ where: { id, companyId } });
    if (!category) throw new NotFoundException("Category not found");
    await category.destroy();
    return this.categories(companyId, requester);
  }

  // ----- Internals

  private includes() {
    return [
      { model: ExpenseCategory, attributes: ["id", "name"] },
      { model: User, as: "chargedToUser", attributes: ["id", "name", "email"] },
      { model: User, as: "createdBy", attributes: ["id", "name", "email"] },
    ];
  }

  private async get(companyId: string, id: string): Promise<ExpenseDto> {
    const expense = await this.expenseModel.findOne({ where: { id, companyId }, include: this.includes() });
    if (!expense) throw new NotFoundException("Expense not found");
    return toDto(expense);
  }

  private async findEditable(companyId: string, access: ProfitAccess, id: string) {
    const expense = await this.expenseModel.findOne({ where: { id, companyId } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (!access.admin && expense.createdByUserId !== access.userId) {
      throw new ForbiddenException("Partners can only change the expenses they added");
    }
    if (expense.profitStatementId) {
      throw new BadRequestException("This expense's billing cycle already has a profit statement — it can't be changed");
    }
    return expense;
  }

  private async validate(companyId: string, access: ProfitAccess, input: ExpenseInputDto) {
    let chargedToUserId: string | null = null;
    if (input.chargedTo === ExpenseChargedTo.USER) {
      if (!input.chargedToUserId) throw new BadRequestException("Choose who this expense is charged to");
      if (!access.admin && input.chargedToUserId !== access.userId) {
        throw new ForbiddenException("Partners can only charge an expense to themselves or the company");
      }
      if (!(await this.isAdminOrPartner(companyId, input.chargedToUserId))) {
        throw new BadRequestException("An expense can only be charged to the company, the Admin or a partner");
      }
      chargedToUserId = input.chargedToUserId;
    }

    if (input.categoryId) {
      const category = await this.categoryModel.findOne({ where: { id: input.categoryId, companyId }, attributes: ["id"] });
      if (!category) throw new BadRequestException("That category no longer exists — reload and try again");
    }

    const company = await this.companyModel.findByPk(companyId, { attributes: ["id", "profitOpeningCycleStart"] });
    if (!company?.profitOpeningCycleStart) {
      throw new BadRequestException("Set up the profit split (first cycle and opening balance) before adding expenses");
    }
    if (input.expenseDate < company.profitOpeningCycleStart) {
      throw new BadRequestException(
        `Expenses before ${company.profitOpeningCycleStart} (the first profit cycle) aren't counted — the opening balance covers them`,
      );
    }
    const frozen = await this.statementModel.findOne({
      where: { companyId, cycleStart: { [Op.lte]: input.expenseDate }, cycleEnd: { [Op.gte]: input.expenseDate } },
      attributes: ["statementNumber"],
    });
    if (frozen) {
      throw new BadRequestException(
        `That date's billing cycle already has a profit statement (${frozen.statementNumber}) — delete it first to add or change its expenses`,
      );
    }

    return {
      title: input.title.trim(),
      amount: Math.round(input.amount * 100) / 100,
      expenseDate: input.expenseDate,
      categoryId: input.categoryId ?? null,
      notes: input.notes?.trim() || null,
      chargedTo: input.chargedTo,
      chargedToUserId,
    };
  }

  private async isAdminOrPartner(companyId: string, userId: string) {
    const user = await this.userModel.findOne({
      where: { id: userId, companyId },
      include: [UserRoleAssignment],
    });
    if (!user) return false;
    if (user.roleAssignments.some((r) => r.role === Role.ADMIN)) return true;
    const profile = await this.staffProfileModel.findByPk(userId);
    return !!profile?.isPartner;
  }
}

function toDto(e: Expense): ExpenseDto {
  const name = (u: User | null | undefined) => (u ? u.name?.trim() || u.email : "—");
  return {
    id: e.id,
    title: e.title,
    amount: e.amount,
    expenseDate: e.expenseDate,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    notes: e.notes,
    chargedTo: e.chargedTo,
    chargedToUserId: e.chargedToUserId,
    chargedToName: e.chargedTo === ExpenseChargedTo.COMPANY ? "Company" : name(e.chargedToUser),
    createdByUserId: e.createdByUserId,
    createdByName: name(e.createdBy),
    profitStatementId: e.profitStatementId,
    createdAt: e.createdAt.toISOString(),
  };
}
