import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op, Transaction } from "sequelize";
import { AccountHolderAdvancesDto, Role } from "@ebay-order-management/shared";
import { AccountHolderAdvance } from "../database/models/account-holder-advance.model";
import { AccountHolderAdvanceUsage } from "../database/models/account-holder-advance-usage.model";
import { Invoice } from "../database/models/invoice.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { AdvanceDto } from "./dto/advance.dto";

/**
 * Account Holder advances (decided 2026-11-25): money an Account Holder pays the company up front. The Admin / partners
 * record each deposit (in the holder's currency); every Account Holder invoice then pays as much of its amount due as
 * the balance allows, oldest deposit first, and only the rest is left to pay. A deposit any invoice used is locked.
 * Deleting or voiding an invoice gives its part back (and may unlock a deposit); editing one re-applies it.
 */
@Injectable()
export class AdvancesService {
  constructor(
    @InjectModel(AccountHolderAdvance) private readonly advanceModel: typeof AccountHolderAdvance,
    @InjectModel(AccountHolderAdvanceUsage) private readonly usageModel: typeof AccountHolderAdvanceUsage,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

  async summary(companyId: string, accountHolderId: string): Promise<AccountHolderAdvancesDto> {
    const holder = await this.findAccountHolder(companyId, accountHolderId);
    const deposits = await this.advanceModel.findAll({
      where: { companyId, accountHolderId },
      include: [{ model: AccountHolderAdvanceUsage, include: [{ model: Invoice, attributes: ["id", "invoiceNumber", "generatedAt"] }] }],
      order: [
        ["depositDate", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    const usageByInvoice = new Map<string, { invoiceId: string; invoiceNumber: string; invoiceDate: string; amount: number }>();
    const rows = deposits.map((d) => {
      const used = round2(d.usages.reduce((sum, u) => sum + u.amount, 0));
      for (const u of d.usages) {
        const entry = usageByInvoice.get(u.invoiceId) ?? {
          invoiceId: u.invoiceId,
          invoiceNumber: u.invoice?.invoiceNumber ?? "",
          invoiceDate: u.invoice?.generatedAt ? new Date(u.invoice.generatedAt).toISOString() : "",
          amount: 0,
        };
        entry.amount = round2(entry.amount + u.amount);
        usageByInvoice.set(u.invoiceId, entry);
      }
      return {
        id: d.id,
        amount: d.amount,
        depositDate: d.depositDate,
        note: d.note,
        used,
        locked: d.usages.length > 0,
        createdAt: new Date(d.createdAt).toISOString(),
      };
    });
    const totalDeposited = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    const totalUsed = round2(rows.reduce((sum, r) => sum + r.used, 0));
    return {
      currency: holder.currency,
      balance: round2(totalDeposited - totalUsed),
      totalDeposited,
      totalUsed,
      // Newest first for the screens.
      deposits: rows.reverse(),
      usages: [...usageByInvoice.values()].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate)),
    };
  }

  async create(companyId: string, accountHolderId: string, dto: AdvanceDto, actingUserId: string) {
    await this.findAccountHolder(companyId, accountHolderId);
    await this.advanceModel.create({
      companyId,
      accountHolderId,
      amount: round2(dto.amount),
      depositDate: dto.depositDate,
      note: dto.note?.trim() || null,
      createdByUserId: actingUserId,
    });
    return this.summary(companyId, accountHolderId);
  }

  async update(companyId: string, accountHolderId: string, advanceId: string, dto: AdvanceDto) {
    await this.changeUnused(companyId, accountHolderId, advanceId, async (advance, transaction) => {
      advance.amount = round2(dto.amount);
      advance.depositDate = dto.depositDate;
      advance.note = dto.note?.trim() || null;
      await advance.save({ transaction });
    });
    return this.summary(companyId, accountHolderId);
  }

  async remove(companyId: string, accountHolderId: string, advanceId: string) {
    await this.changeUnused(companyId, accountHolderId, advanceId, (advance, transaction) =>
      advance.destroy({ transaction }),
    );
    return this.summary(companyId, accountHolderId);
  }

  /**
   * What `apply` would take for an amount due, without saving (the invoice wizard's draft). `editingInvoiceId`: that
   * invoice's own usage counts as available again (it's being re-issued).
   */
  async previewUse(accountHolderId: string, amountDue: number, editingInvoiceId?: string) {
    const deposits = await this.depositsWithBalance(accountHolderId, editingInvoiceId);
    const balance = round2(deposits.reduce((sum, d) => sum + d.left, 0));
    const used = amountDue > 0 ? round2(Math.min(balance, amountDue)) : 0;
    return { used, balanceAfter: round2(balance - used) };
  }

  /**
   * Pays as much of `amountDue` from the holder's advance as the balance allows, oldest deposit first, recording the
   * usage against the invoice. Call `releaseInvoice` first when re-issuing. Locks the holder's deposits so two invoices
   * can't spend the same money.
   */
  async apply(accountHolderId: string, invoiceId: string, amountDue: number, transaction: Transaction) {
    await this.advanceModel.findAll({ where: { accountHolderId }, transaction, lock: transaction.LOCK.UPDATE });
    const deposits = await this.depositsWithBalance(accountHolderId, undefined, transaction);
    const balance = round2(deposits.reduce((sum, d) => sum + d.left, 0));
    let toPay = amountDue > 0 ? round2(Math.min(balance, amountDue)) : 0;
    const used = toPay;
    for (const d of deposits) {
      if (toPay <= 0) break;
      const take = round2(Math.min(d.left, toPay));
      if (take <= 0) continue;
      await this.usageModel.create({ advanceId: d.id, invoiceId, amount: take }, { transaction });
      toPay = round2(toPay - take);
    }
    return { used, balanceAfter: round2(balance - used) };
  }

  /** Gives back whatever this invoice took from the advance (invoice deleted, voided or being re-issued). */
  async releaseInvoice(invoiceId: string, transaction: Transaction) {
    await this.usageModel.destroy({ where: { invoiceId }, transaction });
  }

  /** Deposits oldest first with what's left of each. */
  private async depositsWithBalance(accountHolderId: string, editingInvoiceId?: string, transaction?: Transaction) {
    const deposits = await this.advanceModel.findAll({
      where: { accountHolderId },
      include: [
        {
          model: AccountHolderAdvanceUsage,
          required: false,
          ...(editingInvoiceId ? { where: { invoiceId: { [Op.ne]: editingInvoiceId } } } : {}),
        },
      ],
      order: [
        ["depositDate", "ASC"],
        ["createdAt", "ASC"],
      ],
      transaction,
    });
    return deposits.map((d) => ({
      id: d.id,
      left: round2(d.amount - (d.usages ?? []).reduce((sum, u) => sum + u.amount, 0)),
    }));
  }

  /** Runs `change` on a deposit no invoice has used yet; a used one is locked. */
  private async changeUnused(
    companyId: string,
    accountHolderId: string,
    advanceId: string,
    change: (advance: AccountHolderAdvance, transaction: Transaction) => Promise<unknown>,
  ) {
    await this.findAccountHolder(companyId, accountHolderId);
    await this.advanceModel.sequelize!.transaction(async (transaction) => {
      const advance = await this.advanceModel.findOne({
        where: { id: advanceId, companyId, accountHolderId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!advance) throw new NotFoundException("Advance not found");
      const used = await this.usageModel.count({ where: { advanceId }, transaction });
      if (used > 0) {
        throw new ConflictException(
          "Part of this advance was already used on an invoice, so it can't be changed — add a new advance instead",
        );
      }
      await change(advance, transaction);
    });
  }

  private async findAccountHolder(companyId: string, userId: string) {
    const user = await this.userModel.findOne({
      where: { id: userId, companyId },
      include: [{ model: UserRoleAssignment, where: { role: Role.ACCOUNT_HOLDER }, attributes: [] }],
    });
    if (!user) throw new BadRequestException("That user isn't an Account Holder in your company");
    return user;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
