import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Op, Sequelize, type Transaction } from "sequelize";
import { InjectModel } from "@nestjs/sequelize";
import { OrderStatus, PRODUCT_MAX_IMAGES, ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { Product } from "../database/models/product.model";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { User } from "../database/models/user.model";
import type { JwtPayload } from "../auth/jwt.strategy";
import { likeContains, type Paging } from "../common/pagination.util";
import { CreateProductDto, ProductVariationDto, UpdateProductDto, UpdateStockDto } from "./dto/product.dto";
import { variationName } from "./product-label.util";

// A main product's variations, in order.
const VARIATION_ORDER: [string, string][] = [
  ["position", "ASC"],
  ["createdAt", "ASC"],
];

// Prices are in the Stock Owner's currency, so every product response carries it (and the owner's name, for lists).
const WITH_CURRENCY = { include: [{ model: User, as: "stockOwner", attributes: ["id", "currency", "name", "email"] }] };

function withCurrency(product: Product) {
  const { stockOwner, ...json } = product.toJSON() as Product & { stockOwner?: User | null };
  return { ...json, currency: stockOwner?.currency ?? null, stockOwnerName: stockOwner ? stockOwner.name || stockOwner.email : null };
}

export interface ProductListFilters {
  stockOwnerId?: string;
  fulfillmentType?: ProductFulfillmentType;
  /** Case-insensitive partial matches. */
  title?: string;
  sku?: string;
}

/**
 * Same test OrdersService uses to show a Stock Owner only their own order items: a portal Stock Owner account that
 * isn't also a manager or Account Holder (an Account Holder needs every product on their orders).
 */
function isStockOwnerOnly(requester: JwtPayload) {
  const roles = requester.roles;
  return (
    requester.realm !== "backoffice" &&
    roles.includes(Role.STOCK_OWNER) &&
    !roles.some((r) => r === Role.ADMIN || r === Role.STAFF || r === Role.ACCOUNT_HOLDER)
  );
}

/** A Stock Owner sees their cost and buy price, never the price the company charges the Account Holder. */
function forStockOwner<T extends { sellPrice?: unknown }>(product: T) {
  return { ...product, sellPrice: null };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(OrderItem) private readonly orderItemModel: typeof OrderItem,
  ) {}

  /** Whole list (pickers) when `paging` is null, otherwise one page with the total. */
  async list(companyId: string, requester: JwtPayload, filters: ProductListFilters = {}, paging: Paging | null = null) {
    // A Stock Owner only ever sees their own products, whatever filter is passed.
    const ownerOnly = isStockOwnerOnly(requester);
    const owner = ownerOnly ? requester.sub : filters.stockOwnerId;
    const where: Record<string | symbol, unknown> = { companyId, ...(owner ? { stockOwnerId: owner } : {}) };
    if (filters.fulfillmentType && Object.values(ProductFulfillmentType).includes(filters.fulfillmentType))
      where.fulfillmentType = filters.fulfillmentType;
    // Variations share their main product's title, type, Stock Owner and 3PL, so those filters match whole families.
    if (filters.title?.trim()) where.title = { [Op.iLike]: likeContains(filters.title.trim()) };
    const sku = filters.sku?.trim();
    if (paging) {
      // Paged lists show main products, each with its variations; a SKU search also finds a main product through one
      // of its variations' SKUs.
      where.parentProductId = null;
      if (sku) {
        const pattern = this.productModel.sequelize!.escape(likeContains(sku));
        where[Op.or] = [
          { sku: { [Op.iLike]: likeContains(sku) } },
          {
            id: {
              [Op.in]: Sequelize.literal(
                `(SELECT parent_product_id FROM products WHERE parent_product_id IS NOT NULL AND sku ILIKE ${pattern})`,
              ),
            },
          },
        ];
      }
    } else if (sku) where.sku = { [Op.iLike]: likeContains(sku) };

    // id breaks createdAt ties so pages never overlap.
    const query = {
      where,
      order: [
        ["createdAt", "DESC"],
        ["id", "ASC"],
      ] as [string, string][],
      ...WITH_CURRENCY,
    };
    const { rows: products, count } = paging
      ? await this.productModel.findAndCountAll({ ...query, limit: paging.pageSize, offset: paging.offset })
      : { rows: await this.productModel.findAll(query), count: 0 };
    const variations = paging ? await this.variationsOf(products.map((p) => p.id)) : [];

    const sold = ownerOnly ? await this.unitsSold(companyId, requester.sub) : null;
    const shape = (p: Product) => {
      const json = withCurrency(p);
      return sold ? { ...forStockOwner(json), unitsSold: sold.get(p.id) ?? 0 } : json;
    };
    const data = products.map((p) =>
      paging ? { ...shape(p), variations: variations.filter((v) => v.parentProductId === p.id).map(shape) } : shape(p),
    );
    return paging ? { data, total: count, page: paging.page, pageSize: paging.pageSize } : data;
  }

  private variationsOf(parentIds: string[], transaction?: Transaction) {
    if (!parentIds.length) return Promise.resolve([] as Product[]);
    return this.productModel.findAll({
      where: { parentProductId: parentIds },
      order: VARIATION_ORDER,
      ...WITH_CURRENCY,
      transaction,
    });
  }

  /**
   * Units of each product sold on this Stock Owner's own order lines, leaving out CANCELLED / REFUNDED orders (same
   * rule as the dashboard's "items sold").
   */
  private async unitsSold(companyId: string, stockOwnerId: string): Promise<Map<string, number>> {
    const items = await this.orderItemModel.findAll({
      attributes: ["productId", "quantity"],
      where: { stockOwnerId },
      include: [
        {
          model: Order,
          attributes: [],
          where: { companyId, status: { [Op.notIn]: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
        },
      ],
    });
    const sold = new Map<string, number>();
    for (const i of items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.quantity);
    return sold;
  }

  async get(companyId: string, id: string) {
    const product = await this.productModel.findOne({ where: { id, companyId }, ...WITH_CURRENCY });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /** One product; a main product also carries its `variations`, in order. */
  async getWithCurrency(companyId: string, requester: JwtPayload, id: string) {
    const found = await this.get(companyId, id);
    const variations = found.parentProductId ? [] : await this.variationsOf([found.id]);
    const product = { ...withCurrency(found), variations: variations.map(withCurrency) };
    if (!isStockOwnerOnly(requester)) return product;
    if (product.stockOwnerId !== requester.sub) throw new NotFoundException("Product not found");
    return { ...forStockOwner(product), variations: product.variations.map(forStockOwner) };
  }

  /** Creates the product and its variations in one go; the response lists the variations in the order sent. */
  async create(companyId: string, dto: CreateProductDto) {
    const variations = dto.variations ?? [];
    this.assertVariationsValid(dto, variations);
    await this.assertSkusAvailable(companyId, [dto.sku, ...variations.map((v) => v.sku.trim())]);
    const product = await this.productModel.sequelize!.transaction(async (transaction) => {
      const created = await this.productModel.create({ companyId, ...this.toProductFields(dto) }, { transaction });
      await this.syncVariations(companyId, created, variations, transaction);
      return created;
    });
    return this.withVariations(companyId, product.id);
  }

  /**
   * Full replacement of the product's fields. With `variations`, also replaces its list of variations; without, the
   * existing ones are kept and just follow the main product's title, type, Stock Owner and 3PL.
   */
  async update(companyId: string, id: string, dto: UpdateProductDto) {
    const product = await this.get(companyId, id);
    if (product.parentProductId) {
      throw new BadRequestException("This is a variation. Edit it from its main product.");
    }
    const existing = await this.variationsOf([product.id]);
    const kept = dto.variations ?? existing.map((v) => ({ ...v.get({ plain: true }), id: v.id }) as ProductVariationDto);
    this.assertVariationsValid(dto, kept);
    await this.assertSkusAvailable(
      companyId,
      [dto.sku, ...(dto.variations ?? []).map((v) => v.sku.trim())],
      [product.id, ...existing.map((v) => v.id)],
    );
    await this.productModel.sequelize!.transaction(async (transaction) => {
      product.set(this.toProductFields(dto));
      await product.save({ transaction });
      if (dto.variations) await this.syncVariations(companyId, product, dto.variations, transaction);
      else await this.syncVariationsToMain(product, transaction);
    });
    return this.withVariations(companyId, product.id);
  }

  private async withVariations(companyId: string, id: string) {
    const product = await this.get(companyId, id);
    const variations = await this.variationsOf([id]);
    return { ...withCurrency(product), variations: variations.map(withCurrency) };
  }

  /**
   * Every variation needs a color or a size, and so does the main product once it has variations; no two of them may
   * share both (they'd look identical on orders and invoices).
   */
  private assertVariationsValid(main: CreateProductDto, variations: Array<Pick<ProductVariationDto, "color" | "size">>) {
    if (!variations.length) return;
    const all = [main, ...variations];
    if (all.some((v) => !variationName(v))) {
      throw new BadRequestException("Give the main product and every variation a color or a size, so they can be told apart.");
    }
    const seen = new Set<string>();
    for (const v of all) {
      const key = `${v.color?.trim().toLowerCase() ?? ""}|${v.size?.trim().toLowerCase() ?? ""}`;
      if (seen.has(key)) throw new BadRequestException(`Two variations are both "${variationName(v)}". Each needs its own color or size.`);
      seen.add(key);
    }
  }

  /**
   * Makes the product's variations exactly `list` (in that order): updates the ones with an id, creates the rest and
   * deletes the ones left out — refused while a left-out variation is on an order. Title, type, Stock Owner and 3PL always come from the main product.
   */
  private async syncVariations(companyId: string, main: Product, list: ProductVariationDto[], transaction: Transaction) {
    const existing = await this.variationsOf([main.id], transaction);
    const byId = new Map(existing.map((v) => [v.id, v]));
    if (list.some((v) => v.id && !byId.has(v.id))) throw new BadRequestException("Unknown variation");

    const keep = new Set(list.map((v) => v.id).filter(Boolean));
    const removed = existing.filter((v) => !keep.has(v.id));
    if (removed.length) {
      const onOrders = await this.orderItemModel.findAll({
        attributes: ["productId"],
        where: { productId: removed.map((v) => v.id) },
        transaction,
      });
      if (onOrders.length) {
        const used = removed.filter((v) => onOrders.some((i) => i.productId === v.id));
        throw new ConflictException(
          `Variation ${used.map((v) => `"${variationName(v) || v.sku}"`).join(", ")} is already on orders, so it can't be removed.`,
        );
      }
      await this.productModel.destroy({ where: { id: removed.map((v) => v.id) }, transaction });
    }

    const isStock = main.fulfillmentType === ProductFulfillmentType.STOCK;
    for (const [index, v] of list.entries()) {
      const fields = {
        ...this.sharedFields(main),
        sku: v.sku.trim(),
        color: v.color?.trim() || null,
        size: v.size?.trim() || null,
        position: index + 1,
        stockOwnerCost: isStock ? (v.stockOwnerCost ?? 0) : null,
        buyPrice: isStock ? (v.buyPrice ?? 0) : null,
        sellPrice: isStock ? (v.sellPrice ?? 0) : null,
        stockQuantity: isStock ? (v.stockQuantity ?? 0) : 0,
      };
      const current = v.id ? byId.get(v.id) : undefined;
      if (current) await current.update(fields, { transaction });
      else await this.productModel.create({ companyId, parentProductId: main.id, ...fields }, { transaction });
    }
  }

  /** Copies the main product's shared fields onto its variations (a dropship family has no prices or stock). */
  private async syncVariationsToMain(main: Product, transaction: Transaction) {
    const dropship = main.fulfillmentType === ProductFulfillmentType.DROPSHIP;
    await this.productModel.update(
      {
        ...this.sharedFields(main),
        ...(dropship ? { stockOwnerCost: null, buyPrice: null, sellPrice: null, stockQuantity: 0 } : {}),
      },
      { where: { parentProductId: main.id }, transaction },
    );
  }

  private sharedFields(main: Product) {
    return {
      title: main.title,
      fulfillmentType: main.fulfillmentType,
      stockOwnerId: main.stockOwnerId,
      threePlId: main.threePlId,
    };
  }

  // SKUs are unique per company (products_company_id_sku_unique); this pre-check just gives a friendly error before
  // hitting the constraint (DatabaseExceptionFilter covers the race). `excludeIds` = the product family being saved.
  private async assertSkusAvailable(companyId: string, skus: string[], excludeIds: string[] = []) {
    const seen = new Set<string>();
    for (const sku of skus) {
      if (!sku) throw new BadRequestException("Every variation needs a SKU");
      if (seen.has(sku)) throw new BadRequestException(`SKU "${sku}" is used twice. Each variation needs its own SKU.`);
      seen.add(sku);
    }
    const existing = await this.productModel.findOne({
      where: { companyId, sku: skus, ...(excludeIds.length ? { id: { [Op.notIn]: excludeIds } } : {}) },
      attributes: ["id", "title", "sku"],
    });
    if (existing) {
      throw new ConflictException(`SKU "${existing.sku}" is already used by "${existing.title}". Use a different SKU.`);
    }
  }

  private toProductFields(dto: CreateProductDto) {
    const isStock = dto.fulfillmentType === ProductFulfillmentType.STOCK;

    if (isStock && !dto.threePlId) {
      throw new BadRequestException("threePlId is required for STOCK fulfillment products");
    }
    if (!isStock && dto.threePlId) {
      throw new BadRequestException("threePlId must not be set for DROPSHIP products");
    }
    if (isStock && (!dto.stockOwnerId || dto.stockOwnerCost === undefined || dto.buyPrice === undefined || dto.sellPrice === undefined)) {
      throw new BadRequestException("stockOwnerId, stockOwnerCost, buyPrice and sellPrice are required for STOCK fulfillment products");
    }

    return {
      // DROPSHIP products carry no Stock Owner, no prices, and no stock quantity — the 3PL enters
      // the buy price per order at fulfillment time instead (see orders.service dropship pricing).
      stockOwnerId: isStock ? dto.stockOwnerId : null,
      fulfillmentType: dto.fulfillmentType,
      threePlId: isStock ? dto.threePlId : null,
      sku: dto.sku,
      title: dto.title,
      color: dto.color?.trim() || null,
      size: dto.size?.trim() || null,
      stockOwnerCost: isStock ? dto.stockOwnerCost : null,
      buyPrice: isStock ? dto.buyPrice : null,
      sellPrice: isStock ? dto.sellPrice : null,
      stockQuantity: isStock ? dto.stockQuantity : 0,
    };
  }

  async updateStock(companyId: string, id: string, dto: UpdateStockDto) {
    const product = await this.get(companyId, id);
    product.stockQuantity = dto.stockQuantity;
    await product.save();
    return product;
  }

  async setImages(companyId: string, id: string, layoutJson: string, uploadedUrls: string[]) {
    const product = await this.get(companyId, id);

    let layout: unknown;
    try {
      layout = JSON.parse(layoutJson);
    } catch {
      throw new BadRequestException("layout must be a JSON array");
    }
    if (!Array.isArray(layout) || !layout.every((entry) => typeof entry === "string")) {
      throw new BadRequestException("layout must be a JSON array of strings");
    }
    if (product.fulfillmentType === ProductFulfillmentType.DROPSHIP && layout.length === 0) {
      throw new BadRequestException("A dropship product needs at least one image");
    }
    if (layout.length > PRODUCT_MAX_IMAGES) {
      throw new BadRequestException(`A product can have at most ${PRODUCT_MAX_IMAGES} images`);
    }

    const existing = new Set(product.imageUrls ?? []);
    const imageUrls = layout.map((entry: string) => {
      const match = /^new:(\d+)$/.exec(entry);
      if (match) {
        const url = uploadedUrls[Number(match[1])];
        if (!url) throw new BadRequestException(`layout references missing upload ${entry}`);
        return url;
      }
      // Only URLs already on this product may be kept — never let a client point at arbitrary URLs.
      if (!existing.has(entry)) throw new BadRequestException("layout references an unknown image");
      return entry;
    });
    if (new Set(imageUrls).size !== imageUrls.length) {
      throw new BadRequestException("layout contains duplicate images");
    }

    product.imageUrls = imageUrls;
    product.imageUrl = imageUrls[0] ?? null;
    await product.save();
    return product;
  }
}
