import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, IsNull } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { Goods } from '../goods/entities/goods.entity';
import { Categories } from '../goods/entities/categories.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { Spec } from '../goods/entities/spec.entity';
import { SpecValue } from '../goods/entities/spec_value.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';
import { JwtPayloadType } from '../../types/auth.type';
import type { PaginationOptionsType } from '../../types/pagination.type';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';
import { timeFormatMethod } from '../../utils/timeFormat.util';
import { createGoodsDto } from './dto/createGoods.dto';

const DEFAULT_GOODS_PICTURE =
  'https://img2.baidu.com/it/u=1634170865,2624005952&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500';
@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Goods)
    private readonly goodsRepo: Repository<Goods>,
    @InjectRepository(Categories)
    private readonly categoriesRepo: Repository<Categories>,
    @InjectRepository(GoodsSku)
    private readonly skuRepo: Repository<GoodsSku>,
    @InjectRepository(Spec)
    private readonly specRepo: Repository<Spec>,
    @InjectRepository(SpecValue)
    private readonly specValueRepo: Repository<SpecValue>,
    @InjectRepository(GoodsInfo)
    private readonly goodsInfoRepo: Repository<GoodsInfo>,
  ) {}

  //* 获取商家的商品列表 (SKU级细分)

  async getGoodsList(payload: JwtPayloadType, options: PaginationOptionsType) {
    const { id: userId } = payload;

    // 1. 获取当前用户对应的商家ID
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      return {
        list: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || 10,
        totalPage: 0,
      };
    }

    // 构建查询构建器 (基于 SKU)
    const qb = this.skuRepo
      .createQueryBuilder('sku')
      .leftJoinAndSelect('sku.goods', 'goods')
      .leftJoinAndSelect('goods.category', 'category')
      .where('goods.merchantId = :merchantId', { merchantId: merchant.id });

    // 关键词过滤 (商品名称 或 SKU规格内容)
    if (options.keyword) {
      qb.andWhere(
        new Brackets((sq) => {
          sq.where('goods.name LIKE :keyword', {
            keyword: `%${options.keyword}%`,
          })
            .orWhere('CAST(sku.specs AS CHAR) LIKE :keyword', {
              keyword: `%${options.keyword}%`,
            })
            .orWhere('sku.skuCode LIKE :keyword', {
              keyword: `%${options.keyword}%`,
            });
        }),
      );
    }

    //  分类过滤
    if (options.category) {
      qb.andWhere('goods.categoryId = :categoryId', {
        categoryId: options.category,
      });
    }

    //  排序规则
    const allowedSortFields = ['id', 'price', 'stock', 'createdAt'];
    const sortField =
      options.sort && allowedSortFields.includes(options.sort)
        ? options.sort
        : 'createdAt';
    const sortOrder = options.order === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`sku.${sortField}`, sortOrder);

    //  执行分页
    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<GoodsSku>(qb, paginateOptions);

    const formattedItems = paginationData.items.map((sku) => {
      // 组装规格标签
      const specsLabel = sku.specs
        .map((s) => `${s.name}: ${s.value}`)
        .join(' / ');

      return {
        id: sku.id,
        mainId: sku.goodsId, // SPU ID
        name: sku.goods?.name || '未知商品',
        categoryLabel: sku.goods?.category?.name || '未分类',
        specs: sku.specs,
        specsLabel,
        price: sku.price,
        stock: sku.stock,
        skuCode: sku.skuCode,
        brand: sku.goods?.brand,
        picture: sku.picture || DEFAULT_GOODS_PICTURE,
        status: sku.goods?.status ?? true,
        createdAt: timeFormatMethod(sku.createdAt),
      };
    });

    return {
      list: formattedItems,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };
  }

  //* 获取商家的分类树
  async getMerchantCategories(
    payload: JwtPayloadType,
  ): Promise<CategoryTreeNode[]> {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) return [];

    // 获取该商家的分类
    const categories = await this.categoriesRepo.find({
      order: { id: 'ASC' },
      where: [{ merchantId: merchant.id }, { merchantId: IsNull() }],
    });

    return this.buildTree(categories);
  }

  private buildTree(items: Categories[], pid = 0): CategoryTreeNode[] {
    const tree: CategoryTreeNode[] = [];
    for (const item of items) {
      if (item.pid === pid) {
        const children = this.buildTree(items, item.id);
        const node: CategoryTreeNode = {
          ...item,
          children: children.length > 0 ? children : undefined,
        };
        tree.push(node);
      }
    }
    return tree;
  }

  //*创建商品
  async createGoods(payload: JwtPayloadType, body: createGoodsDto) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new Error('当前用户不是商户');
    }

    // 使用事务确保数据一致性
    return await this.goodsRepo.manager.transaction(async (manager) => {
      // 1. 创建并保存 Goods (SPU)
      const goods = manager.create(Goods, {
        name: body.name,
        description: body.desc,
        categoryId: body.categoriesId,
        status: body.status,
        merchantId: merchant.id,
        mainPicture: body.mainPicture,
        brand: body.brand,
        warningStock: body.warningStock || 0,
      });

      const savedGoods = await manager.save(Goods, goods);

      // 2. 创建并保存 GoodsInfo (商品详情)
      const goodsInfo = manager.create(GoodsInfo, {
        goodsId: savedGoods.id,
        videoUrl: body.videoUrl,
        smallPictures: body.smallPictures,
        bigPictures: body.bigPictures,
        unit: body.unit || '个',
      });
      await manager.save(GoodsInfo, goodsInfo);

      // 3. 处理规格和规格值
      const specsList = body.specs || [];
      const savedSpecs: {
        spec: Spec;
        values: SpecValue[];
      }[] = [];

      if (specsList.length > 0) {
        for (const specItem of specsList) {
          // 创建规格名
          const spec = manager.create(Spec, {
            name: specItem.name,
            goodsId: savedGoods.id,
          });
          const savedSpec = await manager.save(Spec, spec);

          const valuesForThisSpec: SpecValue[] = [];
          for (const valItem of specItem.values) {
            // 创建规格值
            const specVal = manager.create(SpecValue, {
              value: valItem.name,
              picture: valItem.picture || '',
              specId: savedSpec.id,
            });
            const savedSpecVal = await manager.save(SpecValue, specVal);
            valuesForThisSpec.push(savedSpecVal);
          }
          savedSpecs.push({ spec: savedSpec, values: valuesForThisSpec });
        }
      }

      // 4. 生成 SKU
      const allSkus: GoodsSku[] = [];
      // 如果没有规格，或规格列表为空，创建一个默认规格
      if (savedSpecs.length === 0) {
        const defaultSku = manager.create(GoodsSku, {
          goodsId: savedGoods.id,
          price: body.price,
          stock: body.stock,
          skuCode: `SKU${Date.now()}001`, // 默认 SKU 编码
          specs: [], // 无规格
          picture: body.mainPicture || DEFAULT_GOODS_PICTURE,
        });
        allSkus.push(defaultSku);
      } else {
        // 多规格场景，计算笛卡尔积
        const combinations = this.cartesianProduct<SpecValueCombo>(
          savedSpecs.map((s) =>
            s.values.map((v) => ({
              name: s.spec.name,
              value: v.value,
              picture: v.picture,
            })),
          ),
        );

        let skuIdx = 1;
        for (const combo of combinations) {
          const skuPicture =
            combo.find((c) => c.picture)?.picture ||
            body.mainPicture ||
            DEFAULT_GOODS_PICTURE;

          const sku = manager.create(GoodsSku, {
            goodsId: savedGoods.id,
            price: body.price,
            stock: body.stock,
            skuCode: `SKU${Date.now()}${skuIdx.toString().padStart(3, '0')}`,
            specs: combo.map((c) => ({ name: c.name, value: c.value })),
            picture: skuPicture,
          });
          allSkus.push(sku);
          skuIdx++;
        }
      }

      // 保存所有 SKU
      await manager.save(GoodsSku, allSkus);

      // 如果没有传主图，使用第一个 SKU 的图片
      if (!body.mainPicture && allSkus.length > 0) {
        savedGoods.mainPicture = allSkus[0].picture;
        await manager.save(Goods, savedGoods);
      }

      return savedGoods;
    });
  }

  // *创建父分类
  async createParentCategory(payload: JwtPayloadType, categoriesName: string) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new Error('当前用户不是商户');
    }

    // 检查父分类名字是否重复
    const existingCategory = await this.categoriesRepo.findOne({
      where: {
        name: categoriesName,
        merchantId: merchant.id,
        pid: 0,
      },
    });

    if (existingCategory) {
      throw new Error('该父分类名称已存在');
    }

    const category = this.categoriesRepo.create({
      name: categoriesName,
      merchantId: merchant.id,
      pid: 0,
    });

    return await this.categoriesRepo.save(category);
  }

  // *创建子分类
  async createChildCategory(
    payload: JwtPayloadType,
    categoriesName: string,
    parentId: number,
  ) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new Error('当前用户不是商户');
    }

    // 检查父分类是否存在
    const parentCategory = await this.categoriesRepo.findOne({
      where: {
        id: parentId,
        merchantId: merchant.id,
      },
    });

    if (!parentCategory) {
      throw new Error('父分类不存在或不属于当前商户');
    }

    // 检查子分类名字是否重复
    const existingCategory = await this.categoriesRepo.findOne({
      where: {
        name: categoriesName,
        merchantId: merchant.id,
        pid: parentId,
      },
    });

    if (existingCategory) {
      throw new Error('该子分类名称已存在');
    }

    const category = this.categoriesRepo.create({
      name: categoriesName,
      merchantId: merchant.id,
      pid: parentId,
    });

    return await this.categoriesRepo.save(category);
  }

  // *查找对应子分类
  async getChildCategories(payload: JwtPayloadType, parentId: number) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new Error('当前用户不是商户');
    }

    const categories = await this.categoriesRepo.find({
      where: {
        pid: parentId,
        merchantId: merchant.id,
      },
      select: ['id', 'name'],
      order: { id: 'ASC' },
    });

    return categories;
  }

  // 辅助函数：计算笛卡尔积
  private cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce(
      (acc, curr) => {
        return acc.flatMap((a) => curr.map((c) => [...a, c]));
      },
      [[]] as T[][],
    );
  }
}

export interface SpecValueCombo {
  name: string;
  value: string;
  picture: string;
}

export interface CategoryTreeNode extends Categories {
  children?: CategoryTreeNode[];
}
