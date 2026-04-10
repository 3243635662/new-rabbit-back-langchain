import { Controller, Get, Req } from '@nestjs/common';
import { AddressService } from './address.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';

@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /**
   * 获取当前用户的地址列表（分页）
   */
  @Get('')
  async getAddressList(
    @Req() req: { user: JwtPayloadType },
    @PaginateOptions({ defaultLimit: 10, maxLimit: 50 })
    paginationOptions: PaginationOptionsType,
  ) {
    const data = await this.addressService.getAddressList(
      req.user,
      paginationOptions,
    );
    return resFormatMethod(0, '地址列表查询成功', data);
  }
}
