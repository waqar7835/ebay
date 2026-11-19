import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op, Sequelize, Transaction } from "sequelize";
import { ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { AccountHolderOwnedProduct } from "../database/models/account-holder-owned-product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { Product } from "../database/models/product.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";

/**
 * Account Holder as product owner (decided 2026-11-19). An Account Holder is linked to a Stock Owner account of the same
 * company when it's the same account (both roles) or has the same email. The Admin / partners pick which of the linked
 * Stock Owners' STOCK main products the Account Holder owns (variations follow their main product); on orders, an owned
 * line is priced at cost (OrdersService.snapshotItem). Only the linked Stock Owners' products can be on the list.
 */
@Injectable()
export class OwnerPricingService {
  constructor(
    @InjectModel(AccountHolderOwnedProduct) private readonly ownedModel: typeof AccountHolderOwnedProduct,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

  /** Accounts of the company holding `role` that are `user` itself or share its email (case-insensitive). */
  private async linkedAccounts(companyId: string, userId: string, role: Role, transaction?: Transaction): Promise<User[]> {
    const user = await this.userModel.findOne({ where: { id: userId, companyId }, attributes: ["id", "email"], transaction });
    if (!user) return [];
    return this.userModel.findAll({
      where: {
        companyId,
        [Op.or]: [{ id: user.id }, Sequelize.where(Sequelize.fn("lower", Sequelize.col("User.email")), user.email.toLowerCase())],
      },
      attributes: ["id", "name", "email"],
      include: [{ model: UserRoleAssignment, where: { role }, attributes: [] }],
      transaction,
    });
  }

  private async linkedStockOwnerIds(companyId: string, accountHolderId: string, transaction?: Transaction): Promise<string[]> {
    return (await this.linkedAccounts(companyId, accountHolderId, Role.STOCK_OWNER, transaction)).map((u) => u.id);
  }

  /** The linked Stock Owners' STOCK main products — the only products that can be on the Account Holder's list. */
  private async ownableProducts(stockOwnerIds: string[], companyId: string, transaction?: Transaction): Promise<Product[]> {
    if (!stockOwnerIds.length) return [];
    return this.productModel.findAll({
      where: { companyId, stockOwnerId: stockOwnerIds, parentProductId: null, fulfillmentType: ProductFulfillmentType.STOCK },
      attributes: ["id", "sku", "title", "imageUrl", "stockOwnerId"],
      order: [["title", "ASC"]],
      transaction,
    });
  }

  /**
   * For pricing order lines: whether the Account Holder owns a product (a variation counts through its main product).
   * The product's Stock Owner must still be linked, so a product moved to another owner is never priced at cost.
   */
  async ownedChecker(companyId: string, accountHolderId: string, transaction?: Transaction): Promise<(product: Product) => boolean> {
    const stockOwnerIds = new Set(await this.linkedStockOwnerIds(companyId, accountHolderId, transaction));
    if (!stockOwnerIds.size) return () => false;
    const owned = new Set(
      (await this.ownedModel.findAll({ where: { accountHolderId }, attributes: ["productId"], transaction })).map((r) => r.productId),
    );
    return (product) =>
      product.fulfillmentType === ProductFulfillmentType.STOCK &&
      !!product.stockOwnerId &&
      stockOwnerIds.has(product.stockOwnerId) &&
      owned.has(product.parentProductId ?? product.id);
  }

  /** Every product id (main products and their variations) priced at cost for this Account Holder — for the order form. */
  async ownedProductIds(companyId: string, accountHolderId: string): Promise<string[]> {
    const isOwned = await this.ownedChecker(companyId, accountHolderId);
    const stockOwnerIds = await this.linkedStockOwnerIds(companyId, accountHolderId);
    if (!stockOwnerIds.length) return [];
    const products = await this.productModel.findAll({
      where: { companyId, stockOwnerId: stockOwnerIds, fulfillmentType: ProductFulfillmentType.STOCK },
      attributes: ["id", "parentProductId", "stockOwnerId", "fulfillmentType"],
    });
    return products.filter(isOwned).map((p) => p.id);
  }

  /** The Account Holder edit page's "Product owner" card. */
  async getSettings(companyId: string, accountHolderId: string) {
    const profile = await this.assertAccountHolder(companyId, accountHolderId);
    const stockOwners = await this.linkedAccounts(companyId, accountHolderId, Role.STOCK_OWNER);
    const products = await this.ownableProducts(
      stockOwners.map((u) => u.id),
      companyId,
    );
    const ownable = new Set(products.map((p) => p.id));
    const selected = (await this.ownedModel.findAll({ where: { accountHolderId }, attributes: ["productId"] }))
      .map((r) => r.productId)
      .filter((id) => ownable.has(id));
    return {
      autoAddOwnedProducts: profile.autoAddOwnedProducts,
      stockOwners: stockOwners.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      products: products.map((p) => ({ id: p.id, sku: p.sku, title: p.title, imageUrl: p.imageUrl })),
      selectedProductIds: selected,
    };
  }

  /** Replaces the list. Only the linked Stock Owners' STOCK main products are accepted. Existing orders don't change. */
  async updateSettings(companyId: string, accountHolderId: string, input: { productIds: string[]; autoAddOwnedProducts: boolean }) {
    const profile = await this.assertAccountHolder(companyId, accountHolderId);
    const productIds = [...new Set(input.productIds)];
    const ownable = new Set(
      (await this.ownableProducts(await this.linkedStockOwnerIds(companyId, accountHolderId), companyId)).map((p) => p.id),
    );
    if (productIds.some((id) => !ownable.has(id))) {
      throw new BadRequestException("Only this Account Holder's own Stock Owner products can be added");
    }
    await this.ownedModel.sequelize!.transaction(async (transaction) => {
      await this.ownedModel.destroy({ where: { accountHolderId }, transaction });
      if (productIds.length) {
        await this.ownedModel.bulkCreate(
          productIds.map((productId) => ({ accountHolderId, productId })),
          { transaction },
        );
      }
      profile.autoAddOwnedProducts = input.autoAddOwnedProducts;
      await profile.save({ transaction });
    });
    return this.getSettings(companyId, accountHolderId);
  }

  /** A new Account Holder account starts with every product of its linked Stock Owners selected. */
  async prefill(companyId: string, accountHolderId: string) {
    const products = await this.ownableProducts(await this.linkedStockOwnerIds(companyId, accountHolderId), companyId);
    if (!products.length) return;
    await this.ownedModel.bulkCreate(
      products.map((p) => ({ accountHolderId, productId: p.id })),
      { ignoreDuplicates: true },
    );
  }

  /**
   * A main STOCK product was created, or moved to another Stock Owner: it joins the list of every Account Holder linked
   * to its Stock Owner that has "auto-add" on. (Rows left behind for an old owner are ignored by ownedChecker.)
   */
  async onProductSaved(companyId: string, product: Product, previousStockOwnerId: string | null, transaction?: Transaction) {
    if (product.parentProductId || product.fulfillmentType !== ProductFulfillmentType.STOCK || !product.stockOwnerId) return;
    if (product.stockOwnerId === previousStockOwnerId) return;
    const accountHolders = await this.linkedAccounts(companyId, product.stockOwnerId, Role.ACCOUNT_HOLDER, transaction);
    if (!accountHolders.length) return;
    const profiles = await this.accountHolderProfileModel.findAll({
      where: { userId: accountHolders.map((u) => u.id), autoAddOwnedProducts: true },
      attributes: ["userId"],
      transaction,
    });
    if (!profiles.length) return;
    await this.ownedModel.bulkCreate(
      profiles.map((p) => ({ accountHolderId: p.userId, productId: product.id })),
      { ignoreDuplicates: true, transaction },
    );
  }

  private async assertAccountHolder(companyId: string, accountHolderId: string): Promise<AccountHolderProfile> {
    const user = await this.userModel.findOne({
      where: { id: accountHolderId, companyId },
      attributes: ["id"],
      include: [{ model: UserRoleAssignment, where: { role: Role.ACCOUNT_HOLDER }, attributes: [] }],
    });
    if (!user) throw new NotFoundException("Account Holder not found");
    const profile = await this.accountHolderProfileModel.findByPk(accountHolderId);
    if (!profile) throw new NotFoundException("Account Holder profile not found");
    return profile;
  }
}
