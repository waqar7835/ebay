import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ProductsService } from "./products.service";
import { CreateProductDto, UpdateStockDto } from "./dto/product.dto";

@ApiTags("products")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string, @Query("stockOwnerId") stockOwnerId?: string) {
    return this.productsService.list(resolveCompanyId(user, companyId), stockOwnerId);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.productsService.get(resolveCompanyId(user, companyId), id);
  }

  @Post()
  @RequirePermission("canManageStock")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto, @Query("companyId") companyId?: string) {
    return this.productsService.create(resolveCompanyId(user, companyId), dto);
  }

  @Patch(":id/stock")
  @RequirePermission("canManageStock")
  updateStock(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateStockDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.productsService.updateStock(resolveCompanyId(user, companyId), id, dto);
  }

  @Post(":id/image")
  @RequirePermission("canManageStock")
  @UseInterceptors(FileInterceptor("image", multerUploadOptions("products")))
  uploadImage(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("companyId") companyId?: string,
  ) {
    return this.productsService.updateImage(resolveCompanyId(user, companyId), id, publicUploadUrl("products", file.filename));
  }
}
