import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { JwtPayloadType } from '../../types/auth.type';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
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

    return {
      list: paginationData.items,
      total: paginationData.meta.totalItems,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
      totalPage: paginationData.meta.totalPages,
    };
  }
}
