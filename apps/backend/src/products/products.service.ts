import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { PRODUCT_MAX_IMAGES, ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { Product } from "../database/models/product.model";
import { User } from "../database/models/user.model";

// Prices are in the Stock Owner's currency, so every product response carries it.
const WITH_CURRENCY = { include: [{ model: User, as: "stockOwner", attributes: ["id", "currency"] }] };

function withCurrency(product: Product) {
  const { stockOwner, ...json } = product.toJSON() as Product & { stockOwner?: User | null };
  return { ...json, currency: stockOwner?.currency ?? null };
}
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateProductDto, UpdateProductDto, UpdateStockDto } from "./dto/product.dto";

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
  constructor(@InjectModel(Product) private readonly productModel: typeof Product) {}

  async list(companyId: string, requester: JwtPayload, stockOwnerId?: string) {
    // A Stock Owner only ever sees their own products, whatever filter is passed.
    const ownerOnly = isStockOwnerOnly(requester);
    const owner = ownerOnly ? requester.sub : stockOwnerId;
    const products = await this.productModel.findAll({
      where: { companyId, ...(owner ? { stockOwnerId: owner } : {}) },
      order: [["createdAt", "DESC"]],
      ...WITH_CURRENCY,
    });
    return products.map((p) => (ownerOnly ? forStockOwner(withCurrency(p)) : withCurrency(p)));
  }

  async get(companyId: string, id: string) {
    const product = await this.productModel.findOne({ where: { id, companyId }, ...WITH_CURRENCY });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async getWithCurrency(companyId: string, requester: JwtPayload, id: string) {
    const product = withCurrency(await this.get(companyId, id));
    if (!isStockOwnerOnly(requester)) return product;
    if (product.stockOwnerId !== requester.sub) throw new NotFoundException("Product not found");
    return forStockOwner(product);
  }

  async create(companyId: string, dto: CreateProductDto) {
    return this.productModel.create({ companyId, ...this.toProductFields(dto) });
  }

  async update(companyId: string, id: string, dto: UpdateProductDto) {
    const product = await this.get(companyId, id);
    product.set(this.toProductFields(dto));
    await product.save();
    return product;
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
