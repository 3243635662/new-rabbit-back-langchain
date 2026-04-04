import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goods } from '../goods/entities/goods.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { PaginationOptionsType } from '../../types/pagination.type';
import { paginate, IPaginationOptions } from 'nestjs-typeorm-paginate';
import { timeFormatMethod } from '../../utils/timeFormat.util';
import { JwtPayloadType } from '../../types/auth.type';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Goods)
    private readonly goodsRepo: Repository<Goods>,
    @InjectRepository(GoodsSku)
    private readonly skuRepo: Repository<GoodsSku>,
  ) {}

  // * 内部校验是否为管理员
  private checkAdmin(payload: JwtPayloadType) {
    if (payload.roleId !== 1) {
      throw new ForbiddenException('您的权限不足，仅管理员可访问此接口');
    }
  }

  // *根据query来获取(待审核 审核成功 审核失败 全部)  也支持搜索 分页 价格 分类来查
  async getGoodsList(
    payload: JwtPayloadType,
    options: PaginationOptionsType & { state?: string },
  ) {
    this.checkAdmin(payload);
    const { state, keyword, category, sort, order, page, limit } = options;

    const qb = this.goodsRepo
      .createQueryBuilder('goods')
      .leftJoinAndSelect('goods.category', 'category')
      .leftJoinAndSelect('goods.merchant', 'merchant');

    // 状态过滤
    if (state && state !== 'all') {
      if (state === 'pending') {
        qb.andWhere('goods.isReviewed = :isReviewed', { isReviewed: false });
      } else if (state === 'success') {
        qb.andWhere(
          'goods.isReviewed = :isReviewed AND goods.isReviewedSeccuss = :success',
          {
            isReviewed: true,
            success: true,
          },
        );
      } else if (state === 'fail') {
        qb.andWhere(
          'goods.isReviewed = :isReviewed AND goods.isReviewedSeccuss = :success',
          {
            isReviewed: true,
            success: false,
          },
        );
      }
    }

    // 关键词搜索
    if (keyword) {
      qb.andWhere('goods.name LIKE :keyword', { keyword: `%${keyword}%` });
    }

    // 分类过滤
    if (category) {
      qb.andWhere('goods.categoryId = :categoryId', { categoryId: category });
    }

    // 排序
    const allowedSortFields = ['id', 'createdAt', 'isReviewed'];
    const sortField =
      sort && allowedSortFields.includes(sort) ? sort : 'createdAt';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`goods.${sortField}`, sortOrder);

    // 分页
    const paginateOptions: IPaginationOptions = {
      page: page || 1,
      limit: limit || 10,
    };

    const paginationData = await paginate<Goods>(qb, paginateOptions);

    const formattedItems = paginationData.items.map((goods) => ({
      ...goods,
      createdAt: timeFormatMethod(goods.createdAt),
      updatedAt: timeFormatMethod(goods.updatedAt),
    }));

    return {
      list: formattedItems,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };
  }

  // *根据商品ID获取审核详情 (包括 SKU 信息)
  async getGoodsAuditDetail(payload: JwtPayloadType, goodsId: number) {
    this.checkAdmin(payload);
    const goods = await this.goodsRepo.findOne({
      where: { id: goodsId },
      relations: ['category', 'merchant', 'skus', 'goodsInfo'],
    });

    if (!goods) {
      throw new NotFoundException('商品不存在');
    }

    return {
      ...goods,
      createdAt: timeFormatMethod(goods.createdAt),
      updatedAt: timeFormatMethod(goods.updatedAt),
    };
  }

  // *审核操作
  async auditGoods(payload: JwtPayloadType, goodsId: number, success: boolean) {
    this.checkAdmin(payload);
    const goods = await this.goodsRepo.findOne({ where: { id: goodsId } });
    if (!goods) {
      throw new NotFoundException('商品不存在');
    }

    goods.isReviewed = true;
    goods.isReviewedSeccuss = success;

    return await this.goodsRepo.save(goods);
  }
}
