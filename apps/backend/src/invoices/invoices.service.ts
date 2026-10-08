import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op, Transaction, WhereOptions } from "sequelize";
import {
  Currency,
  InvoiceableOrderDto,
  InvoiceLineDetails,
  InvoiceLineKind,
  InvoiceRole,
  InvoiceStatus,
  InvoiceTemplateSnapshot,
  OrderStatus,
  ProductFulfillmentType,
  Role,
} from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Product } from "../database/models/product.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { FinanceService, lineSellTotal } from "../finance/finance.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import { readUpload } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { INVOICE_ROLES, InvoiceDraftDto } from "./dto/invoice-draft.dto";
import { InvoicePdfLine, renderInvoicePdf } from "./invoice-pdf";
import { renderTemplatedInvoicePdf } from "./invoice-pdf-templated";
import { InvoiceTemplatesService } from "./templates/invoice-templates.service";

/** Stock Owner and 3PL invoices are in PKR; an Account Holder's in their own currency. */
const PKR = "PKR";
/** Orders can be invoiced once they've shipped. */
const INVOICEABLE_STATUSES = [OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/**
 * Columns on `orders` recording which invoice paid an order out to its Account Holder / 3PL
 * (null = open), and which one carried the negative adjustment after a refund. The Stock Owner's
 * equivalents are per item, on `order_items` (one order can mix Stock Owners).
 */
const ORDER_CLAIM_COLUMNS = {
  [Role.ACCOUNT_HOLDER]: {
    owner: "accountHolderId",
    invoice: "accountHolderInvoiceId",
    refund: "accountHolderRefundInvoiceId",
  },
  [Role.THREE_PL]: { owner: "threePlId", invoice: "threePlInvoiceId", refund: "threePlRefundInvoiceId" },
} as const;

interface DraftLine {
  orderId: string | null;
  kind: InvoiceLineKind;
  description: string;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  details: InvoiceLineDetails | null;
}

/** An order the chosen user+role can be invoiced for, plus the ids to mark once it's on an invoice. */
interface Candidate {
  order: Order;
  line: DraftLine;
  /** Order ids (Account Holder / 3PL) or order item ids (Stock Owner). */
  claimIds: string[];
}

/** Everything a PDF needs besides the company and its style. */
interface InvoiceContent {
  invoiceNumber: string;
  date: Date;
  status: string;
  partnerName: string;
  role: InvoiceRole;
  currency: string;
  lines: InvoicePdfLine[];
  totalAmount: number;
}

interface Draft {
  partner: User;
  role: InvoiceRole;
  currency: string;
  lines: DraftLine[];
  totalAmount: number;
  claimIds: string[];
  refundClaimIds: string[];
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderItem) private readonly orderItemModel: typeof OrderItem,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    @InjectModel(InvoiceLineItem) private readonly lineItemModel: typeof InvoiceLineItem,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    private readonly finance: FinanceService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly templates: InvoiceTemplatesService,
  ) {}

  /** Managers see every company invoice; everyone else only their own. */
  async list(companyId: string, requester: JwtPayload, userId?: string) {
    const seeAll = await this.canSeeCompanyInvoices(requester);
    const where = { companyId, ...(seeAll ? (userId ? { userId } : {}) : { userId: requester.sub }) };
    return this.invoiceModel.findAll({
      where,
      include: [InvoiceLineItem, { model: User, attributes: ["id", "name", "email"] }],
      order: [
        ["sequence", "DESC"],
        ["lineItems", "position", "ASC"],
      ],
    });
  }

  /** What the wizard offers for this user+role: open SHIPPED/DELIVERED orders, then refund adjustments. */
  async invoiceable(
    companyId: string,
    requester: JwtPayload,
    userId: string,
    role: InvoiceRole,
    editingInvoiceId?: string,
  ): Promise<InvoiceableOrderDto[]> {
    this.assertPortal(requester);
    if (editingInvoiceId) await this.findEditable(companyId, editingInvoiceId, userId, role);
    if (!INVOICE_ROLES.includes(role))
      throw new BadRequestException("Invoices are made for Account Holders, Stock Owners or 3PLs");
    const partner = await this.findPartner(companyId, userId, role);
    const currency = invoiceCurrency(partner, role);
    const { open, refunds } = await this.candidates(companyId, userId, role, currency, editingInvoiceId);
    return [...open.values(), ...refunds.values()].map(({ order, line }) => ({
      orderId: order.id,
      ebayOrderRef: order.ebayOrderRef,
      orderDate: order.orderDate,
      status: order.status,
      kind: line.kind as InvoiceLineKind.ORDER | InvoiceLineKind.REFUND,
      description: line.description,
      currency,
      needsRecalculation: line.kind === InvoiceLineKind.ORDER && !order.exchangeRates,
      grossAmount: line.grossAmount,
      deductionAmount: line.deductionAmount,
      netAmount: line.netAmount,
    }));
  }

  /** Renders the wizard's selection as a DRAFT PDF without saving anything. */
  async preview(companyId: string, requester: JwtPayload, dto: InvoiceDraftDto, editingInvoiceId?: string): Promise<Buffer> {
    this.assertPortal(requester);
    const editing = editingInvoiceId
      ? await this.findEditable(companyId, editingInvoiceId, dto.userId, dto.role)
      : undefined;
    const draft = await this.buildDraft(companyId, dto, editingInvoiceId);
    const template = await this.templates.snapshot(companyId, dto.templateId);
    const company = await this.companyModel.findByPk(companyId);
    return this.render(company!.name, template, {
      invoiceNumber: editing ? `${editing.invoiceNumber} (DRAFT)` : "DRAFT",
      date: new Date(),
      status: "Draft — not issued",
      partnerName: partnerName(draft.partner),
      role: draft.role,
      currency: draft.currency,
      lines: draft.lines,
      totalAmount: draft.totalAmount,
    });
  }

  async create(companyId: string, requester: JwtPayload, dto: InvoiceDraftDto) {
    this.assertPortal(requester);
    const draft = await this.buildDraft(companyId, dto);
    const template = await this.templates.snapshot(companyId, dto.templateId);

    const sequelize = this.invoiceModel.sequelize!;
    const invoiceId = await sequelize.transaction(async (transaction) => {
      // Row lock so two invoices created at once can't take the same number.
      const company = await this.companyModel.findByPk(companyId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!company) throw new NotFoundException("Company not found");
      company.lastInvoiceSequence += 1;
      await company.save({ transaction });

      const now = new Date();
      const invoice = await this.invoiceModel.create(
        {
          companyId,
          userId: draft.partner.id,
          role: draft.role,
          currency: draft.currency,
          invoiceNumber: formatInvoiceNumber(company.name, company.lastInvoiceSequence, now),
          sequence: company.lastInvoiceSequence,
          status: InvoiceStatus.UNPAID,
          totalAmount: draft.totalAmount,
          generatedByUserId: requester.sub,
          generatedAt: now,
          template,
        },
        { transaction },
      );
      await this.lineItemModel.bulkCreate(
        draft.lines.map((line, position) => ({ ...line, position, invoiceId: invoice.id })),
        { transaction },
      );
      await this.claim(draft, invoice.id, transaction);
      return invoice.id;
    });

    return this.invoiceModel.findByPk(invoiceId, { include: [InvoiceLineItem] });
  }

  /** One invoice with its lines — for the edit wizard (managers only). */
  async get(companyId: string, requester: JwtPayload, invoiceId: string) {
    const invoice = await this.invoiceModel.findOne({
      where: { id: invoiceId, companyId },
      include: [InvoiceLineItem, { model: User, attributes: ["id", "name", "email"] }],
      order: [["lineItems", "position", "ASC"]],
    });
    if (!invoice || !(await this.canSeeCompanyInvoices(requester))) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /**
   * Re-issues an UNPAID invoice from a new selection, keeping its number and date: its orders are
   * released and the new selection claimed in one transaction. Same user and role only. PAID invoices
   * can't be edited — void and re-issue them.
   */
  async update(companyId: string, requester: JwtPayload, invoiceId: string, dto: InvoiceDraftDto) {
    this.assertPortal(requester);
    await this.findEditable(companyId, invoiceId, dto.userId, dto.role);
    const draft = await this.buildDraft(companyId, dto, invoiceId);
    const template = await this.templates.snapshot(companyId, dto.templateId);

    const sequelize = this.invoiceModel.sequelize!;
    await sequelize.transaction(async (transaction) => {
      const invoice = await this.invoiceModel.findOne({
        where: { id: invoiceId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!invoice || invoice.status !== InvoiceStatus.UNPAID) {
        throw new ConflictException("This invoice was just paid or deleted — reload and try again");
      }
      const blocker = await this.refundInvoiceFor(invoice, transaction);
      if (blocker) {
        throw new BadRequestException(
          `Invoice ${blocker} has a refund adjustment for an order on this invoice — delete that invoice first`,
        );
      }
      await this.release(invoice, transaction);
      await this.lineItemModel.destroy({ where: { invoiceId }, transaction });
      await this.lineItemModel.bulkCreate(
        draft.lines.map((line, position) => ({ ...line, position, invoiceId })),
        { transaction },
      );
      invoice.currency = draft.currency;
      invoice.totalAmount = draft.totalAmount;
      invoice.template = template;
      await invoice.save({ transaction });
      await this.claim(draft, invoiceId, transaction);
    });
    return this.invoiceModel.findByPk(invoiceId, { include: [InvoiceLineItem] });
  }

  /**
   * UNPAID invoices are deleted; PAID ones become VOID (kept for the record). Either way their orders
   * go back to open for this role so they can be invoiced again.
   */
  async remove(companyId: string, requester: JwtPayload, invoiceId: string) {
    this.assertPortal(requester);
    const invoice = await this.invoiceModel.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === InvoiceStatus.VOID) throw new BadRequestException("This invoice is already void");

    const voiding = invoice.status === InvoiceStatus.PAID;
    const sequelize = this.invoiceModel.sequelize!;
    await sequelize.transaction(async (transaction) => {
      // Reopening an order whose refund adjustment already sits on another invoice would leave that
      // adjustment with nothing to offset.
      const blocker = await this.refundInvoiceFor(invoice, transaction);
      if (blocker) {
        throw new BadRequestException(
          `Invoice ${blocker} has a refund adjustment for an order on this invoice — delete that invoice first`,
        );
      }
      await this.release(invoice, transaction);
      if (!voiding) {
        await invoice.destroy({ transaction });
      } else {
        invoice.status = InvoiceStatus.VOID;
        invoice.voidedAt = new Date();
        await invoice.save({ transaction });
      }
    });
    return { id: invoice.id, voided: voiding };
  }

  async markPaid(companyId: string, requester: JwtPayload, invoiceId: string) {
    this.assertPortal(requester);
    const invoice = await this.invoiceModel.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status !== InvoiceStatus.UNPAID)
      throw new BadRequestException("Only unpaid invoices can be marked paid");
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    await invoice.save();
    return invoice;
  }

  /** The invoice PDF — for managers, or the user it was made for. */
  async pdf(companyId: string, requester: JwtPayload, invoiceId: string) {
    const invoice = await this.invoiceModel.findOne({
      where: { id: invoiceId, companyId },
      include: [InvoiceLineItem, User],
      order: [["lineItems", "position", "ASC"]],
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.userId !== requester.sub && !(await this.canSeeCompanyInvoices(requester))) {
      throw new NotFoundException("Invoice not found");
    }
    const company = await this.companyModel.findByPk(companyId);
    const content: InvoiceContent = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.generatedAt,
      status: STATUS_LABELS[invoice.status],
      partnerName: partnerName(invoice.user),
      role: invoice.role as InvoiceRole,
      currency: invoice.currency,
      lines: invoice.lineItems,
      totalAmount: invoice.totalAmount,
    };
    // Invoices issued before templates existed keep their original look (and the current company logo).
    const buffer = invoice.template
      ? await this.render(company!.name, invoice.template, content)
      : await renderInvoicePdf({
          ...content,
          company: { name: company!.name, logo: company!.logoUrl ? await readUpload(company!.logoUrl) : null },
        });
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  /** Draws an invoice in its template's layout, colors and (frozen) logo. */
  private async render(companyName: string, template: InvoiceTemplateSnapshot, content: InvoiceContent) {
    return renderTemplatedInvoicePdf({
      ...content,
      company: { name: companyName },
      layout: template.layout,
      colors: template.colors,
      logo: template.logoUrl ? await readUpload(template.logoUrl) : null,
      watermark: template.watermark,
    });
  }

  // Creating/deleting/paying invoices is the company's own job (Admin, or Staff with
  // canGenerateInvoices via PermissionsGuard) — not the backoffice's.
  private assertPortal(requester: JwtPayload) {
    if (requester.realm !== "portal") {
      throw new ForbiddenException("Invoices are managed by the company's Admin");
    }
  }

  private async findEditable(companyId: string, invoiceId: string, userId: string, role: InvoiceRole) {
    const invoice = await this.invoiceModel.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status !== InvoiceStatus.UNPAID) {
      throw new BadRequestException("Only unpaid invoices can be edited — void a paid invoice and issue a new one");
    }
    if (invoice.userId !== userId || invoice.role !== role) {
      throw new BadRequestException("An invoice's user and role can't be changed — create a new invoice instead");
    }
    return invoice;
  }

  private async canSeeCompanyInvoices(requester: JwtPayload): Promise<boolean> {
    if (requester.realm === "backoffice" || requester.roles.includes(Role.ADMIN)) return true;
    if (!requester.roles.includes(Role.STAFF)) return false;
    const profile = await this.staffProfileModel.findByPk(requester.sub);
    return !!profile && (profile.canGenerateInvoices || profile.canViewFinancials);
  }

  private async findPartner(companyId: string, userId: string, role: InvoiceRole) {
    const user = await this.userModel.findOne({
      where: { id: userId, companyId },
      include: [{ model: UserRoleAssignment, where: { role }, attributes: [] }],
    });
    if (!user) throw new BadRequestException("That user doesn't hold this role in your company");
    return user;
  }

  /** `editingInvoiceId`: that invoice's own orders count as open (it's being re-issued). */
  private async buildDraft(companyId: string, dto: InvoiceDraftDto, editingInvoiceId?: string): Promise<Draft> {
    const partner = await this.findPartner(companyId, dto.userId, dto.role);
    const currency = invoiceCurrency(partner, dto.role);
    const { open, refunds } = await this.candidates(companyId, dto.userId, dto.role, currency, editingInvoiceId);

    const pick = (ids: string[], from: Map<string, Candidate>) =>
      [...new Set(ids)].map((id) => {
        const candidate = from.get(id);
        if (!candidate)
          throw new ConflictException("One of the selected orders can no longer be invoiced — reload and try again");
        return candidate;
      });
    const picked = pick(dto.orderIds, open).sort((a, b) => a.order.orderDate.localeCompare(b.order.orderDate));
    const legacy = picked.find((c) => !c.order.exchangeRates);
    if (legacy) {
      throw new BadRequestException(
        `Order ${legacy.order.ebayOrderRef} was saved before currencies — edit and save it (to convert it with today's rates) before invoicing`,
      );
    }
    const pickedRefunds = pick(dto.refundOrderIds, refunds);
    const miscLines: DraftLine[] = dto.miscLines.map((misc) => ({
      orderId: null,
      kind: InvoiceLineKind.MISC,
      description: misc.title.trim(),
      grossAmount: round2(misc.amount),
      deductionAmount: 0,
      netAmount: round2(misc.amount),
      details: null,
    }));

    const lines = [...picked.map((c) => c.line), ...pickedRefunds.map((c) => c.line), ...miscLines];
    if (!lines.length) throw new BadRequestException("Select at least one order or add a line");
    return {
      partner,
      role: dto.role,
      currency,
      lines,
      totalAmount: round2(lines.reduce((sum, line) => sum + line.netAmount, 0)),
      claimIds: picked.flatMap((c) => c.claimIds),
      refundClaimIds: pickedRefunds.flatMap((c) => c.claimIds),
    };
  }

  /** Open orders and pending refund adjustments for this user+role, keyed by order id. */
  private async candidates(
    companyId: string,
    userId: string,
    role: InvoiceRole,
    currency: string,
    editingInvoiceId?: string,
  ) {
    if (role === Role.STOCK_OWNER) return this.stockOwnerCandidates(companyId, userId, editingInvoiceId);

    const cols = ORDER_CLAIM_COLUMNS[role];
    // Not yet on an invoice — or on the one being edited.
    const unclaimed = editingInvoiceId ? { [Op.or]: [null, editingInvoiceId] } : null;
    const openOrders = await this.orderModel.findAll({
      where: {
        companyId,
        status: INVOICEABLE_STATUSES,
        [cols.owner]: userId,
        [cols.invoice]: unclaimed,
        // A DROPSHIP order isn't owed to the 3PL until every line has its buy price.
        ...(role === Role.THREE_PL ? { threePlPayoutSnapshot: { [Op.ne]: null } } : {}),
      } as WhereOptions<Order>,
      order: [["orderDate", "ASC"]],
    });
    const open = new Map<string, Candidate>();
    if (role === Role.ACCOUNT_HOLDER) {
      // A DROPSHIP order isn't billable to the Account Holder until every line has its client buying price.
      const billable = openOrders.filter((o) => !o.items.some((i) => !i.stockOwnerId && i.clientTotalSnapshot == null));
      const titles = await this.productTitles(billable.flatMap((o) => o.items));
      const rates = await this.accountHolderRates(billable, currency as Currency);
      for (const order of billable) {
        const line = this.accountHolderLine(order, currency as Currency, rates.get(order.id)!, titles);
        open.set(order.id, { order, line, claimIds: [order.id] });
      }
    } else {
      const products = await this.productInfo(openOrders.flatMap((o) => o.items));
      for (const order of openOrders)
        open.set(order.id, { order, line: this.threePlLine(order, products), claimIds: [order.id] });
    }

    const refundedOrders = await this.orderModel.findAll({
      where: {
        companyId,
        status: OrderStatus.REFUNDED,
        [cols.owner]: userId,
        [cols.invoice]: { [Op.ne]: null },
        [cols.refund]: unclaimed,
      } as WhereOptions<Order>,
      order: [["orderDate", "ASC"]],
    });
    const refunds = await this.refundCandidates(
      refundedOrders
        // A refunded order on the invoice being edited just drops off it — no adjustment against itself.
        .filter((order) => order[cols.invoice] !== editingInvoiceId)
        .map((order) => ({ order, invoiceId: order[cols.invoice]!, claimIds: [order.id] })),
      currency,
    );
    return { open, refunds };
  }

  private async stockOwnerCandidates(companyId: string, userId: string, editingInvoiceId?: string) {
    // Not yet on an invoice — or on the one being edited.
    const isOpen = (invoiceId: string | null) => !invoiceId || invoiceId === editingInvoiceId;
    const items = await this.orderItemModel.findAll({
      where: {
        stockOwnerId: userId,
        stockOwnerRefundInvoiceId: editingInvoiceId ? { [Op.or]: [null, editingInvoiceId] } : null,
      },
    });
    const orders = await this.orderModel.findAll({
      where: {
        companyId,
        id: [...new Set(items.map((i) => i.orderId))],
        status: [...INVOICEABLE_STATUSES, OrderStatus.REFUNDED],
      },
      order: [["orderDate", "ASC"]],
    });
    const titles = await this.productTitles(items);

    const open = new Map<string, Candidate>();
    const refundable: { order: Order; invoiceId: string; claimIds: string[] }[] = [];
    for (const order of orders) {
      const mine = order.items.filter((i) => i.stockOwnerId === userId && isOpen(i.stockOwnerRefundInvoiceId));
      if (order.status === OrderStatus.REFUNDED) {
        // Group by the invoice that paid them out (the same one, unless the order was edited in between).
        const byInvoice = new Map<string, string[]>();
        for (const item of mine.filter((i) => !isOpen(i.stockOwnerInvoiceId))) {
          byInvoice.set(item.stockOwnerInvoiceId!, [...(byInvoice.get(item.stockOwnerInvoiceId!) ?? []), item.id]);
        }
        for (const [invoiceId, claimIds] of byInvoice) refundable.push({ order, invoiceId, claimIds });
        continue;
      }
      const openItems = mine.filter((i) => isOpen(i.stockOwnerInvoiceId));
      if (openItems.length) {
        open.set(order.id, {
          order,
          line: this.stockOwnerLine(order, openItems, titles),
          claimIds: openItems.map((i) => i.id),
        });
      }
    }
    return { open, refunds: await this.refundCandidates(refundable, PKR) };
  }

  private async productTitles(items: OrderItem[]) {
    const products = await this.productInfo(items);
    return new Map([...products].map(([id, p]) => [id, p.title]));
  }

  private async productInfo(items: OrderItem[]) {
    const products = await this.productModel.findAll({
      attributes: ["id", "title", "fulfillmentType"],
      where: { id: [...new Set(items.map((i) => i.productId))] },
    });
    return new Map(products.map((p) => [p.id, { title: p.title, fulfillmentType: p.fulfillmentType }]));
  }

  /**
   * PKR per unit of the Account Holder's currency for each order: the rate locked on the order, or
   * today's rate for orders that don't have one (pre-currency orders, or the holder changed currency).
   */
  private async accountHolderRates(orders: Order[], currency: Currency) {
    const rates = new Map<string, number>();
    let today: number | undefined;
    for (const order of orders) {
      let rate = order.exchangeRates?.[currency];
      if (!rate) rate = today ??= (await this.exchangeRates.resolve([currency]))[currency]!;
      rates.set(order.id, rate);
    }
    return rates;
  }

  /** A negative line reversing what each order paid out on its original invoice. */
  private async refundCandidates(
    refundable: { order: Order; invoiceId: string; claimIds: string[] }[],
    currency: string,
  ) {
    const refunds = new Map<string, Candidate>();
    if (!refundable.length) return refunds;
    const invoiceIds = [...new Set(refundable.map((r) => r.invoiceId))];
    const [originals, invoices] = await Promise.all([
      this.lineItemModel.findAll({
        where: {
          invoiceId: invoiceIds,
          orderId: refundable.map((r) => r.order.id),
          kind: InvoiceLineKind.ORDER,
        },
      }),
      this.invoiceModel.findAll({ attributes: ["id", "invoiceNumber", "currency"], where: { id: invoiceIds } }),
    ]);
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    for (const { order, invoiceId, claimIds } of refundable) {
      const original = originals.find((l) => l.invoiceId === invoiceId && l.orderId === order.id);
      // An adjustment can only reverse an amount in the same currency as this invoice.
      if (!original || invoiceById.get(invoiceId)?.currency !== currency) continue;
      refunds.set(order.id, {
        order,
        claimIds,
        line: {
          orderId: order.id,
          kind: InvoiceLineKind.REFUND,
          description: `Refund adjustment: Order ${order.ebayOrderRef} (invoiced on ${invoiceById.get(invoiceId)!.invoiceNumber})`,
          grossAmount: 0,
          deductionAmount: original.netAmount,
          netAmount: round2(-original.netAmount),
          details: null,
        },
      });
    }
    return refunds;
  }

  /**
   * The Account Holder keeps the eBay money, so their line is what they owe the company for the
   * order: the company's profit share + the products' buying price + the 3PL charge. Worked out in
   * their currency — as entered when the order is in it, otherwise converted from PKR at `pkrRate`.
   * Shipping: none entered means the label was bought on eBay and is already out of the payout; an
   * entered shipping cost is a label bought outside eBay, paid by the company, so the holder reimburses it.
   */
  private accountHolderLine(order: Order, currency: Currency, pkrRate: number, titles: Map<string, string>): DraftLine {
    const asEntered = !!order.exchangeRates && order.accountHolderCurrency === currency;
    const fromPkr = (pkr: number) => pkr / pkrRate;
    const selling = round2(asEntered ? (order.ebayNetProceedsOriginal ?? 0) : fromPkr(order.ebayNetProceeds));
    const shipping = round2(asEntered ? (order.shippingCostOriginal ?? 0) : fromPkr(order.shippingCost));
    const threePl = round2(
      asEntered ? (order.threePlPriceChargedOriginal ?? 0) : fromPkr(order.threePlPriceChargedSnapshot ?? 0),
    );

    // STOCK: product sell price × qty, in the Stock Owner's currency, so always converted from PKR. DROPSHIP: the
    // line's client buying price, entered in the Account Holder's currency (as entered when the invoice is in it).
    const buying = order.items.map((i) =>
      round2(asEntered && i.clientTotalOriginal != null ? i.clientTotalOriginal : fromPkr(lineSellTotal(i))),
    );
    // The order-level selling, 3PL and shipping amounts are split across products by buying value (by qty if all zero).
    const weights = buying.some((b) => b > 0) ? buying : order.items.map((i) => i.quantity);
    const sellingSplit = allocate(selling, weights);
    const threePlSplit = allocate(threePl, weights);
    const shippingSplit = allocate(shipping, weights);
    const products = order.items.map((item, i) => ({
      productId: item.productId,
      title: titles.get(item.productId) ?? "Product",
      quantity: item.quantity,
      selling: sellingSplit[i],
      buying: buying[i],
      threePl: threePlSplit[i],
      shipping: shippingSplit[i],
    }));

    const buyingTotal = round2(buying.reduce((sum, b) => sum + b, 0));
    const profit = round2(selling - buyingTotal - threePl - shipping);
    const companySharePercent = round2(100 - order.accountHolderSharePercentSnapshot);
    const companyShare = round2(profit * (companySharePercent / 100));
    return {
      orderId: order.id,
      kind: InvoiceLineKind.ORDER,
      description: `Order ${order.ebayOrderRef}`,
      grossAmount: profit,
      // The Account Holder's own share of the profit, which they keep.
      deductionAmount: round2(profit - companyShare),
      netAmount: round2(companyShare + buyingTotal + threePl + shipping),
      details: {
        role: "ACCOUNT_HOLDER",
        orderRef: order.ebayOrderRef,
        orderDate: order.orderDate,
        companySharePercent,
        products,
      },
    };
  }

  /**
   * STOCK orders pay the 3PL its fee per order; on a DROPSHIP order the payout is the sum of the
   * lines' buy totals (the 3PL bought the products). The invoice shows the two in separate sections.
   */
  private threePlLine(order: Order, products: Map<string, { title: string; fulfillmentType: ProductFulfillmentType }>): DraftLine {
    const fee = round2(order.threePlPayoutSnapshot ?? 0);
    const dropship = order.items.some((i) => products.get(i.productId)?.fulfillmentType === ProductFulfillmentType.DROPSHIP);
    return {
      orderId: order.id,
      kind: InvoiceLineKind.ORDER,
      description: `Order ${order.ebayOrderRef} — ${dropship ? "dropship buy price" : "fulfillment fee"}`,
      grossAmount: fee,
      deductionAmount: 0,
      netAmount: fee,
      details: {
        role: "THREE_PL",
        orderRef: order.ebayOrderRef,
        orderDate: order.orderDate,
        units: order.items.reduce((sum, i) => sum + i.quantity, 0),
        fulfillment: dropship ? ProductFulfillmentType.DROPSHIP : ProductFulfillmentType.STOCK,
        status: order.status,
        trackingNumber: order.trackingNumber,
        products: order.items.map((i) => ({ title: products.get(i.productId)?.title ?? "Product", quantity: i.quantity })),
      },
    };
  }

  private stockOwnerLine(order: Order, items: OrderItem[], titles: Map<string, string>): DraftLine {
    const gross = round2(items.reduce((sum, i) => sum + (i.buyPriceSnapshot ?? 0) * i.quantity, 0));
    const net = round2(items.reduce((sum, i) => sum + this.finance.stockOwnerItemNet(i), 0));
    const units = items.reduce((sum, i) => sum + i.quantity, 0);
    return {
      orderId: order.id,
      kind: InvoiceLineKind.ORDER,
      description: `Order ${order.ebayOrderRef} — ${units} unit(s)`,
      grossAmount: gross,
      deductionAmount: round2(gross - net),
      netAmount: net,
      details: {
        role: "STOCK_OWNER",
        orderRef: order.ebayOrderRef,
        orderDate: order.orderDate,
        products: items.map((i) => ({
          productId: i.productId,
          title: titles.get(i.productId) ?? "Product",
          quantity: i.quantity,
          cost: i.stockOwnerCostSnapshot ?? 0,
          price: i.buyPriceSnapshot ?? 0,
          payoutMode: i.stockOwnerPayoutModeSnapshot,
          sharePercent: i.stockOwnerSharePercentSnapshot,
        })),
      },
    };
  }

  /**
   * Marks the draft's orders (or Stock Owner items) as invoiced. Only rows still open are updated, so
   * if another invoice claimed any of them in the meantime the counts differ and everything rolls back.
   */
  private async claim(draft: Draft, invoiceId: string, transaction: Transaction) {
    const claimed = async (ids: string[], update: () => Promise<[number]>) => {
      if (!ids.length) return;
      const [count] = await update();
      if (count !== ids.length) {
        throw new ConflictException("Some of these orders were just invoiced or changed — reload and try again");
      }
    };

    if (draft.role === Role.STOCK_OWNER) {
      await claimed(draft.claimIds, () =>
        this.orderItemModel.update(
          { stockOwnerInvoiceId: invoiceId },
          { where: { id: draft.claimIds, stockOwnerInvoiceId: null }, transaction },
        ),
      );
      await claimed(draft.refundClaimIds, () =>
        this.orderItemModel.update(
          { stockOwnerRefundInvoiceId: invoiceId },
          {
            where: {
              id: draft.refundClaimIds,
              stockOwnerInvoiceId: { [Op.ne]: null },
              stockOwnerRefundInvoiceId: null,
            },
            transaction,
          },
        ),
      );
      return;
    }

    const cols = ORDER_CLAIM_COLUMNS[draft.role];
    const orders = this.orderModel.unscoped();
    await claimed(draft.claimIds, () =>
      orders.update(
        { [cols.invoice]: invoiceId },
        {
          where: { id: draft.claimIds, status: INVOICEABLE_STATUSES, [cols.invoice]: null } as WhereOptions<Order>,
          transaction,
        },
      ),
    );
    await claimed(draft.refundClaimIds, () =>
      orders.update(
        { [cols.refund]: invoiceId },
        {
          where: {
            id: draft.refundClaimIds,
            status: OrderStatus.REFUNDED,
            [cols.invoice]: { [Op.ne]: null },
            [cols.refund]: null,
          } as WhereOptions<Order>,
          transaction,
        },
      ),
    );
  }

  /** Puts every order (or Stock Owner item) on this invoice back to open for its role. */
  private async release(invoice: Invoice, transaction: Transaction) {
    if (invoice.role === Role.STOCK_OWNER) {
      await this.orderItemModel.update(
        { stockOwnerInvoiceId: null },
        { where: { stockOwnerInvoiceId: invoice.id }, transaction },
      );
      await this.orderItemModel.update(
        { stockOwnerRefundInvoiceId: null },
        { where: { stockOwnerRefundInvoiceId: invoice.id }, transaction },
      );
      return;
    }
    const cols = ORDER_CLAIM_COLUMNS[invoice.role as Role.ACCOUNT_HOLDER | Role.THREE_PL];
    const orders = this.orderModel.unscoped();
    await orders.update(
      { [cols.invoice]: null },
      { where: { [cols.invoice]: invoice.id } as WhereOptions<Order>, transaction },
    );
    await orders.update(
      { [cols.refund]: null },
      { where: { [cols.refund]: invoice.id } as WhereOptions<Order>, transaction },
    );
  }

  /** Number of another invoice holding a refund adjustment for one of this invoice's orders, if any. */
  private async refundInvoiceFor(invoice: Invoice, transaction: Transaction): Promise<string | null> {
    let refundInvoiceId: string | null = null;
    if (invoice.role === Role.STOCK_OWNER) {
      const item = await this.orderItemModel.findOne({
        where: { stockOwnerInvoiceId: invoice.id, stockOwnerRefundInvoiceId: { [Op.ne]: null } },
        transaction,
      });
      refundInvoiceId = item?.stockOwnerRefundInvoiceId ?? null;
    } else {
      const cols = ORDER_CLAIM_COLUMNS[invoice.role as Role.ACCOUNT_HOLDER | Role.THREE_PL];
      const order = await this.orderModel.unscoped().findOne({
        where: { [cols.invoice]: invoice.id, [cols.refund]: { [Op.ne]: null } } as WhereOptions<Order>,
        transaction,
      });
      refundInvoiceId = order ? order[cols.refund] : null;
    }
    if (!refundInvoiceId || refundInvoiceId === invoice.id) return null;
    const other = await this.invoiceModel.findByPk(refundInvoiceId, { attributes: ["invoiceNumber"], transaction });
    return other?.invoiceNumber ?? "another invoice";
  }
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.UNPAID]: "Finalized",
  [InvoiceStatus.PAID]: "Paid",
  [InvoiceStatus.VOID]: "Void",
};

function invoiceCurrency(partner: User, role: InvoiceRole): string {
  return role === Role.ACCOUNT_HOLDER ? partner.currency : PKR;
}

/** Splits `total` across `weights`, rounded to 2 decimals, with the rounding remainder on the last share. */
function allocate(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => (sum > 0 ? round2((total * w) / sum) : 0));
  shares[shares.length - 1] = round2(total - shares.slice(0, -1).reduce((a, b) => a + b, 0));
  return shares;
}

function partnerName(user: User): string {
  return user.name?.trim() || user.email;
}

/** e.g. "Alpha Drop", 7, 2026 → AD-2026-007. The number keeps counting across years. */
function formatInvoiceNumber(companyName: string, sequence: number, date: Date): string {
  const initials = companyName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "").charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 4);
  return `${initials || "INV"}-${date.getFullYear()}-${String(sequence).padStart(3, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
