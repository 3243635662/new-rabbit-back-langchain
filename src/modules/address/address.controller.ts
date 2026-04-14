import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginateOptions } from '../../common/decorators/pagination.decorator';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { CreateAddressDto } from './dto/createAddress.dto';
import { UpdateAddressDto } from './dto/updateAddress.dto';
import { UpdateAddressLabelDto } from './dto/updateAddressLabel.dto';

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

  /**
   * 新增地址
   */
  @Post('')
  async addAddress(
    @Req() req: { user: JwtPayloadType },
    @Body() createAddressDto: CreateAddressDto,
  ) {
    const result = await this.addressService.addAddress(
      req.user,
      createAddressDto,
    );
    return resFormatMethod(0, '地址新增成功', result);
  }

  /**
   * 修改地址标签
   */
  @Patch(':id/label')
  async updateLabel(
    @Req() req: { user: JwtPayloadType },
    @Param('id') id: string,
    @Body() updateAddressLabelDto: UpdateAddressLabelDto,
  ) {
    const result = await this.addressService.updateLabel(
      req.user,
      id,
      updateAddressLabelDto,
    );
    return resFormatMethod(0, '标签修改成功', result);
  }

  /**
   * 修改地址
   */
  @Put(':id')
  async updateAddress(
    @Req() req: { user: JwtPayloadType },
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    const result = await this.addressService.updateAddress(
      req.user,
      id,
      updateAddressDto,
    );
    return resFormatMethod(0, '地址修改成功', result);
  }

  /**
   * 删除地址
   */
  @Delete(':id')
  async deleteAddress(
    @Req() req: { user: JwtPayloadType },
    @Param('id') id: string,
  ) {
    const result = await this.addressService.deleteAddress(req.user, id);
    return resFormatMethod(0, '地址删除成功', result);
  }
}
