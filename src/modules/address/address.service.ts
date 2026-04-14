import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { AreaService } from './area.service';
import { JwtPayloadType } from '../../types/auth.type';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';
import { CreateAddressDto } from './dto/createAddress.dto';
import { UpdateAddressDto } from './dto/updateAddress.dto';
import { UpdateAddressLabelDto } from './dto/updateAddressLabel.dto';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    private readonly areaService: AreaService,
  ) {}

  /**
   * 获取用户地址列表（分页）
   * @param payload JWT 用户信息
   * @param options 分页参数
   */
  async getAddressList(
    payload: JwtPayloadType,
    options: PaginationOptionsType,
  ) {
    const { id: userId } = payload;

    const qb = this.addressRepo
      .createQueryBuilder('address')
      .where('address.userId = :userId', { userId })
      .andWhere('address.deletedAt IS NULL');

    // 关键词搜索（收货人姓名 / 手机号 / 详细地址）
    if (options.keyword) {
      qb.andWhere(
        '(address.name LIKE :keyword OR address.phone LIKE :keyword OR address.detail LIKE :keyword)',
        { keyword: `%${options.keyword}%` },
      );
    }

    // 排序：默认地址优先，然后按创建时间倒序
    qb.orderBy('address.isDefault', 'DESC').addOrderBy(
      'address.createdAt',
      'DESC',
    );

    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<Address>(qb, paginateOptions);

    // 批量补全区划名称
    const codes = paginationData.items
      .map((item) => item.areaCode)
      .filter(Boolean);
    const pathMap = new Map<
      string,
      Awaited<ReturnType<typeof this.areaService.getFullAreaPath>>
    >();

    if (codes.length > 0) {
      // 去重查询
      const uniqueCodes = [...new Set(codes)];
      for (const code of uniqueCodes) {
        pathMap.set(code, await this.areaService.getFullAreaPath(code));
      }
    }

    const list = paginationData.items.map((item) => {
      const path = pathMap.get(item.areaCode);
      return {
        ...item,
        province: path?.province?.name ?? null,
        city: path?.city?.name ?? null,
        district: path?.district?.name ?? null,
        street: path?.street?.name ?? null,
      };
    });

    return {
      list,
      total: paginationData.meta.totalItems,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
      totalPage: paginationData.meta.totalPages,
    };
  }

  /**
   * 用户新增地址
   */
  async addAddress(payload: JwtPayloadType, dto: CreateAddressDto) {
    const { id: userId } = payload;

    // 如果新增的是默认地址，先将该用户其他默认地址取消
    if (dto.isDefault) {
      await this.addressRepo.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const address = this.addressRepo.create({
      userId,
      ...dto,
    });

    return this.addressRepo.save(address);
  }

  /**
   * 修改地址标签
   */
  async updateLabel(
    payload: JwtPayloadType,
    addressId: string,
    dto: UpdateAddressLabelDto,
  ) {
    const { id: userId } = payload;

    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('地址不存在');
    }

    address.label = dto.label ?? address.label;
    return this.addressRepo.save(address);
  }

  /**
   * 修改地址
   */
  async updateAddress(
    payload: JwtPayloadType,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const { id: userId } = payload;

    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('地址不存在');
    }

    // 如果修改为默认地址，先将该用户其他默认地址取消
    if (dto.isDefault) {
      await this.addressRepo.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(address, dto);
    return this.addressRepo.save(address);
  }

  /**
   * 删除地址（软删除）
   */
  async deleteAddress(payload: JwtPayloadType, addressId: string) {
    const { id: userId } = payload;

    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('地址不存在');
    }

    await this.addressRepo.softRemove(address);
    return { id: addressId };
  }
}
