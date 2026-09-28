import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PRODUCT_MAX_IMAGES } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ProductsService } from "./products.service";
import { CreateProductDto, SetProductImagesDto, UpdateProductDto, UpdateStockDto } from "./dto/product.dto";

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

  @Patch(":id")
  @RequirePermission("canManageStock")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.productsService.update(resolveCompanyId(user, companyId), id, dto);
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

  /**
   * Replaces the product's whole image gallery in one request. `layout` is a JSON array giving the
   * final order: each entry is either an already-saved URL of this product or `"new:<i>"` pointing
   * at the i-th uploaded file in `images`. The first entry becomes the cover.
   */
  @Put(":id/images")
  @RequirePermission("canManageStock")
  @UseInterceptors(FilesInterceptor("images", PRODUCT_MAX_IMAGES, multerUploadOptions("products")))
  setImages(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: SetProductImagesDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Query("companyId") companyId?: string,
  ) {
    return this.productsService.setImages(
      resolveCompanyId(user, companyId),
      id,
      dto.layout,
      files.map((f) => publicUploadUrl("products", f.filename)),
    );
  }
}
