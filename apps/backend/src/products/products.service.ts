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
    if (dto.fulfillmentType === ProductFulfillmentType.STOCK && !dto.threePlId) {
      throw new BadRequestException("threePlId is required for STOCK fulfillment products");
    }
    if (dto.fulfillmentType === ProductFulfillmentType.DROPSHIP && dto.threePlId) {
      throw new BadRequestException("threePlId must not be set for DROPSHIP products");
    }

    return this.productModel.create({
      companyId,
      stockOwnerId: dto.stockOwnerId,
      fulfillmentType: dto.fulfillmentType,
      threePlId: dto.fulfillmentType === ProductFulfillmentType.STOCK ? dto.threePlId : null,
      sku: dto.sku,
      title: dto.title,
      stockOwnerCost: dto.stockOwnerCost,
      buyPrice: dto.buyPrice,
      sellPrice: dto.sellPrice,
      stockQuantity: dto.stockQuantity,
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
