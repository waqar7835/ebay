import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";

@Injectable()
export class CompaniesService {
  constructor(@InjectModel(Company) private readonly companyModel: typeof Company) {}

  async get(companyId: string) {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  async updateLogo(companyId: string, logoUrl: string) {
    const company = await this.get(companyId);
    company.logoUrl = logoUrl;
    await company.save();
    return company;
  }

  async updateName(companyId: string, name: string) {
    const company = await this.get(companyId);
    company.name = name;
    await company.save();
    return company;
  }

  async updateBillingAnchorDay(companyId: string, billingAnchorDay: number) {
    const company = await this.get(companyId);
    company.billingAnchorDay = billingAnchorDay;
    await company.save();
    return company;
  }

  async list() {
    return this.companyModel.findAll({ order: [["createdAt", "DESC"]] });
  }
}
