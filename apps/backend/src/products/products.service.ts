import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ProductFulfillmentType } from "@ebay-order-management/shared";
import { Product } from "../database/models/product.model";
import { CreateProductDto, UpdateStockDto } from "./dto/product.dto";

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product) private readonly productModel: typeof Product) {}

  async list(companyId: string, stockOwnerId?: string) {
    return this.productModel.findAll({
      where: { companyId, ...(stockOwnerId ? { stockOwnerId } : {}) },
      order: [["createdAt", "DESC"]],
    });
  }

  async get(companyId: string, id: string) {
    const product = await this.productModel.findOne({ where: { id, companyId } });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async create(companyId: string, dto: CreateProductDto) {
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

    return this.productModel.create({
      companyId,
      // DROPSHIP products carry no Stock Owner, no prices, and no stock quantity — the 3PL enters
      // the buy price per order at fulfillment time instead (see orders.service dropship pricing).
      stockOwnerId: isStock ? dto.stockOwnerId : null,
      fulfillmentType: dto.fulfillmentType,
      threePlId: isStock ? dto.threePlId : null,
      sku: dto.sku,
      title: dto.title,
      stockOwnerCost: isStock ? dto.stockOwnerCost : null,
      buyPrice: isStock ? dto.buyPrice : null,
      sellPrice: isStock ? dto.sellPrice : null,
      stockQuantity: isStock ? dto.stockQuantity : 0,
    });
  }

  async updateStock(companyId: string, id: string, dto: UpdateStockDto) {
    const product = await this.get(companyId, id);
    product.stockQuantity = dto.stockQuantity;
    await product.save();
    return product;
  }

  async updateImage(companyId: string, id: string, imageUrl: string) {
    const product = await this.get(companyId, id);
    product.imageUrl = imageUrl;
    await product.save();
    return product;
  }
}
