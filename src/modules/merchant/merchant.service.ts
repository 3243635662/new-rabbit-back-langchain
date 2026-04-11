import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, IsNull } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { Goods } from '../goods/entities/goods.entity';
import { Categories } from '../goods/entities/categories.entity';
import { GoodsSku } from '../goods/entities/goods_sku.entity';
import { Spec } from '../goods/entities/spec.entity';
import { SpecValue } from '../goods/entities/spec_value.entity';
import { GoodsInfo } from '../goods/entities/goodInfo.entity';
import { Brands } from '../goods/entities/brands.entity';
import { OrderStatus } from '../order/entities/orders.entity';
import {
  OrderItem,
  ShippingStatus,
} from '../order/entities/order_items.entity';
import { JwtPayloadType } from '../../types/auth.type';
import { PaginationOptionsType } from '../../types/pagination.type';
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
    @InjectRepository(Brands)
    private readonly brandsRepo: Repository<Brands>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
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
      .leftJoinAndSelect('goods.brandRelation', 'brandRelation')
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
        brand: sku.goods?.brandRelation?.name || '无品牌',
        picture: sku.picture || DEFAULT_GOODS_PICTURE,
        status: sku.goods?.status ?? true,
        isReviewed: sku.goods?.isReviewed ?? false,
        isLaunching: sku.isLaunching,
        isReviewedSeccuss: sku.goods?.isReviewedSeccuss ?? false,
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

  // *获取商家的分类树
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
      throw new ForbiddenException('当前用户不是商户');
    }

    // 使用事务确保数据一致性
    return await this.goodsRepo.manager.transaction(async (manager) => {
      // 1. 处理品牌 (如果不存在则自动创建)
      let brandId: number | null = null;
      if (body.brand) {
        let brandEntity = await manager.findOne(Brands, {
          where: { name: body.brand },
        });
        if (!brandEntity) {
          brandEntity = manager.create(Brands, {
            name: body.brand,
            picture: body.mainPicture || '', // 默认给个商品主图或者空
          });
          brandEntity = await manager.save(Brands, brandEntity);
        }
        brandId = brandEntity.id;
      }

      // 2. 创建并保存 Goods (SPU)
      const goods = manager.create(Goods, {
        name: body.name,
        description: body.desc,
        categoryId: body.categoriesId,
        status: body.status,
        merchantId: merchant.id,
        mainPicture: body.mainPicture,
        brandId: brandId,
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
      throw new ForbiddenException('当前用户不是商户');
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
      throw new ConflictException('该分类名称已存在');
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
      throw new ForbiddenException('当前用户不是商户');
    }

    // 检查父分类是否存在
    const parentCategory = await this.categoriesRepo.findOne({
      where: {
        id: parentId,
        merchantId: merchant.id,
      },
    });

    if (!parentCategory) {
      throw new NotFoundException('父分类不存在或不属于当前商户');
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
      throw new ConflictException('该分类名称已存在');
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
      throw new ForbiddenException('当前用户不是商户');
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

  // *获取商家当前拥有的品牌列表 (即该商家已上架商品所关联的所有品牌)
  async getMerchantBrands(payload: JwtPayloadType): Promise<Brands[]> {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) return [];

    // 查询该商家所有商品关联的品牌，去重
    const brands = await this.brandsRepo
      .createQueryBuilder('brand')
      .innerJoin('brand.goods', 'goods')
      .where('goods.merchantId = :merchantId', { merchantId: merchant.id })
      .select(['brand.id', 'brand.name', 'brand.picture'])
      .distinct(true)
      .getMany();

    return brands;
  }

  // *根据品牌ID获取商家旗下的商品列表
  async getGoodsByBrand(
    payload: JwtPayloadType,
    brandId: number,
    options: PaginationOptionsType,
  ) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    const qb = this.goodsRepo
      .createQueryBuilder('goods')
      .leftJoinAndSelect('goods.category', 'category')
      .leftJoinAndSelect('goods.brandRelation', 'brandRelation')
      .leftJoinAndSelect('goods.goodsInfo', 'goodsInfo')
      .where('goods.merchantId = :merchantId', { merchantId: merchant.id })
      .andWhere('goods.brandId = :brandId', { brandId });

    // 分页
    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<Goods>(qb, paginateOptions);

    const formattedItems = paginationData.items.map((goods) => {
      const categoryLabel = goods.category?.name || '未分类';
      const brandLabel = goods.brandRelation?.name || '无品牌';

      return {
        id: goods.id,
        name: goods.name || '未知商品',
        description: goods.description || '',
        categoryId: goods.categoryId,
        categoryLabel,
        brandId: goods.brandId,
        brand: brandLabel,
        warningStock: goods.warningStock,
        picture: goods.mainPicture || DEFAULT_GOODS_PICTURE,
        status: goods.status ?? true,
        isReviewed: goods.isReviewed ?? false,
        isReviewedSeccuss: goods.isReviewedSeccuss ?? false,
        salesCount: goods.goodsInfo?.salesCount ?? 0,
        commentCount: goods.goodsInfo?.commentCount ?? 0,
        collectCount: goods.goodsInfo?.collectCount ?? 0,
        createdAt: timeFormatMethod(goods.createdAt),
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

  // *根据商品ID获取该商品下的 SKU 列表
  async getSkusByGoodsId(
    payload: JwtPayloadType,
    goodsId: number,
    options: PaginationOptionsType,
  ) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    const targetGoods = await this.goodsRepo.findOne({
      where: {
        id: goodsId,
        merchantId: merchant.id,
      },
      select: ['id', 'name', 'status', 'isReviewed', 'isReviewedSeccuss'],
    });

    if (!targetGoods) {
      throw new NotFoundException('商品不存在或不属于当前商户');
    }

    const qb = this.skuRepo
      .createQueryBuilder('sku')
      .leftJoinAndSelect('sku.goods', 'goods')
      .leftJoinAndSelect('goods.category', 'category')
      .leftJoinAndSelect('goods.brandRelation', 'brandRelation')
      .where('sku.goodsId = :goodsId', { goodsId })
      .andWhere('goods.merchantId = :merchantId', { merchantId: merchant.id })
      .orderBy('sku.createdAt', 'DESC');

    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<GoodsSku>(qb, paginateOptions);

    const formattedItems = paginationData.items.map((sku) => {
      const specsLabel = sku.specs
        .map((s) => `${s.name}: ${s.value}`)
        .join(' / ');

      return {
        id: sku.id,
        mainId: sku.goodsId,
        name: sku.goods?.name || '未知商品',
        categoryLabel: sku.goods?.category?.name || '未分类',
        specs: sku.specs,
        specsLabel,
        price: sku.price,
        stock: sku.stock,
        skuCode: sku.skuCode,
        brand: sku.goods?.brandRelation?.name || '无品牌',
        picture: sku.picture || DEFAULT_GOODS_PICTURE,
        status: sku.goods?.status ?? true,
        isReviewed: sku.goods?.isReviewed ?? false,
        isLaunching: sku.isLaunching,
        isReviewedSeccuss: sku.goods?.isReviewedSeccuss ?? false,
        createdAt: timeFormatMethod(sku.createdAt),
      };
    });

    return {
      goodsId: targetGoods.id,
      goodsName: targetGoods.name,
      list: formattedItems,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };
  }
  // *获取商家的订单列表（以 OrderItem 为主维度）
  async getMerchantOrders(
    payload: JwtPayloadType,
    options: PaginationOptionsType,
  ) {
    const { id: userId } = payload;

    // 1. 获取当前用户对应的商家
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

    // 2. 构建查询：以 order_item 为主表，关联订单和 SKU
    const qb = this.orderItemRepo
      .createQueryBuilder('oi')
      .leftJoinAndSelect('oi.order', 'order')
      .leftJoinAndSelect('oi.sku', 'sku')
      .leftJoinAndSelect('sku.goods', 'goods')
      .where('goods.merchantId = :merchantId', { merchantId: merchant.id });

    // 3. 订单号搜索
    if (options.keyword) {
      qb.andWhere('order.orderNo LIKE :keyword', {
        keyword: `%${options.keyword}%`,
      });
    }

    // 4. 发货状态筛选（逗号分隔，如 "0,1"）
    if (options.status) {
      const statusList: number[] = options.status
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 2);

      if (statusList.length > 0) {
        qb.andWhere('oi.shippingStatus IN (:...statusList)', { statusList });
      }
    }

    // 5. 时间范围筛选（基于订单创建时间）
    if (options.startTime) {
      const startTime = options.startTime;
      qb.andWhere('order.createdAt >= :startTime', { startTime });
    }
    if (options.endTime) {
      const endTime = options.endTime;
      qb.andWhere('order.createdAt <= :endTime', { endTime });
    }

    // 6. 排序（默认按订单创建时间倒序）
    const allowedSortFields = ['createdAt', 'shippingStatus', 'price'];
    const sortField =
      options.sort && allowedSortFields.includes(options.sort)
        ? options.sort
        : 'createdAt';
    const sortOrder = options.order === 'ASC' ? 'ASC' : 'DESC';

    if (sortField === 'createdAt') {
      qb.orderBy('order.createdAt', sortOrder);
    } else if (sortField === 'shippingStatus') {
      qb.orderBy('oi.shippingStatus', sortOrder);
    } else {
      qb.orderBy(`oi.${sortField}`, sortOrder);
    }

    // 7. 分页
    const paginateOptions: IPaginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
    };

    const paginationData = await paginate<OrderItem>(qb, paginateOptions);

    // 8. 格式化输出
    const shippingStatusMap: Record<number, string> = {
      0: '待发货',
      1: '已发货',
      2: '已收货',
      3: '售后中',
    };

    const orderStatusMap: Record<number, string> = {
      1: '待支付',
      2: '已支付',
      7: '已取消',
      9: '已超时',
    };

    const formattedItems = paginationData.items.map((oi) => ({
      // 订单项信息
      orderItemId: oi.id,
      skuId: oi.skuId,
      skuName: oi.skuName,
      skuCode: oi.skuCode,
      specs: oi.sku?.specs || [],
      picture: oi.sku?.picture || DEFAULT_GOODS_PICTURE,
      count: oi.count,
      price: oi.price,
      totalPrice: oi.totalPrice,
      // 发货状态
      shippingStatus: oi.shippingStatus,
      shippingStatusLabel: shippingStatusMap[oi.shippingStatus] || '未知',
      shippedAt: oi.shippedAt ? timeFormatMethod(oi.shippedAt) : null,
      // 所属订单信息
      orderId: oi.orderId,
      orderNo: oi.order?.orderNo || '',
      orderStatus: oi.order?.status,
      orderStatusLabel: orderStatusMap[oi.order?.status] || '未知',
      totalAmount: oi.order?.totalAmount,
      payAmount: oi.order?.payAmount,
      addressSnapshot: oi.order?.addressSnapshot,
      paymentMethod: oi.order?.paymentMethod,
      paidAt: oi.order?.paidAt ? timeFormatMethod(oi.order.paidAt) : null,
      remark: oi.remark,
      createdAt: oi.order?.createdAt
        ? timeFormatMethod(oi.order.createdAt)
        : '',
    }));

    return {
      list: formattedItems,
      total: paginationData.meta.totalItems,
      totalPage: paginationData.meta.totalPages,
      page: paginationData.meta.currentPage,
      limit: paginationData.meta.itemsPerPage,
    };
  }

  // *导出商家订单
  async exportMerchantOrders(
    payload: JwtPayloadType,
    options: PaginationOptionsType,
  ) {
    const exportOptions: PaginationOptionsType = {
      ...options,
      page: 1,
      limit: 10000,
    };
    const result = await this.getMerchantOrders(payload, exportOptions);
    return result.list;
  }

  // *商家确认发货（OrderItem 级别）
  async shipOrderItems(payload: JwtPayloadType, orderItemIds: string[]) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    // 1. 查询这些订单项，并关联 SKU → Goods 验证归属
    const items = await this.orderItemRepo.find({
      where: { id: In(orderItemIds) },
      relations: ['sku', 'sku.goods', 'order'],
    });

    if (items.length === 0) {
      throw new NotFoundException('未找到订单项');
    }

    // 2. 过滤出属于当前商家且可发货的订单项
    const now = new Date();
    const shippableItems: OrderItem[] = [];

    for (const item of items) {
      // 验证归属：SKU → Goods → merchantId
      if (item.sku?.goods?.merchantId !== merchant.id) {
        continue;
      }
      // 只有待发货状态才能发货
      if (item.shippingStatus !== ShippingStatus.PENDING) {
        continue;
      }
      // 订单必须是已支付状态才能发货
      if (item.order?.status !== OrderStatus.PAID) {
        continue;
      }
      shippableItems.push(item);
    }

    if (shippableItems.length === 0) {
      throw new ForbiddenException('没有可发货的订单项');
    }

    // 3. 更新发货状态
    for (const item of shippableItems) {
      await this.orderItemRepo.update(
        { id: item.id },
        { shippingStatus: ShippingStatus.SHIPPED, shippedAt: now },
      );
    }

    return {
      shippedCount: shippableItems.length,
      skippedCount: orderItemIds.length - shippableItems.length,
    };
  }

  // *批量操作商家订单项状态（OrderItem 级别）
  async batchUpdateOrderItemStatus(
    payload: JwtPayloadType,
    orderItemIds: string[],
    targetStatus: ShippingStatus,
  ) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    // 1. 查询这些订单项，并关联 SKU → Goods 验证归属
    const items = await this.orderItemRepo.find({
      where: { id: In(orderItemIds) },
      relations: ['sku', 'sku.goods', 'order'],
    });

    if (items.length === 0) {
      throw new NotFoundException('未找到订单项');
    }

    // 2. 定义允许的状态转换
    const allowedTransitions: Record<number, ShippingStatus[]> = {
      [ShippingStatus.PENDING]: [ShippingStatus.SHIPPED],
      [ShippingStatus.SHIPPED]: [ShippingStatus.RECEIVED],
      [ShippingStatus.RECEIVED]: [ShippingStatus.AFTER_SALE],
    };

    // 3. 过滤出属于当前商家且可操作的订单项
    const now = new Date();
    const updatableItems: OrderItem[] = [];

    for (const item of items) {
      // 验证归属：SKU → Goods → merchantId
      if (item.sku?.goods?.merchantId !== merchant.id) {
        continue;
      }
      // 订单必须是已支付状态
      if (item.order?.status !== OrderStatus.PAID) {
        continue;
      }
      // 校验状态转换是否合法
      const allowed = allowedTransitions[item.shippingStatus];
      if (allowed && allowed.includes(targetStatus)) {
        updatableItems.push(item);
      }
    }

    if (updatableItems.length === 0) {
      throw new ForbiddenException('所选订单项不支持该状态变更');
    }

    // 4. 批量更新
    const updateData: Partial<OrderItem> = {
      shippingStatus: targetStatus,
    };
    if (targetStatus === ShippingStatus.SHIPPED) {
      updateData.shippedAt = now;
    }
    if (targetStatus === ShippingStatus.RECEIVED) {
      updateData.receivedAt = now;
    }

    await this.orderItemRepo.update(
      { id: In(updatableItems.map((i) => i.id)) },
      updateData,
    );

    return {
      updatedCount: updatableItems.length,
      skippedCount: orderItemIds.length - updatableItems.length,
    };
  }

  // *确认收货（OrderItem 级别，用户确认收货）
  async confirmOrderItems(payload: JwtPayloadType, orderItemIds: string[]) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    const items = await this.orderItemRepo.find({
      where: { id: In(orderItemIds) },
      relations: ['sku', 'sku.goods', 'order'],
    });

    if (items.length === 0) {
      throw new NotFoundException('未找到订单项');
    }

    const now = new Date();
    const confirmableItems: OrderItem[] = [];

    for (const item of items) {
      if (item.sku?.goods?.merchantId !== merchant.id) continue;
      if (item.shippingStatus !== ShippingStatus.SHIPPED) continue;
      if (item.order?.status !== OrderStatus.PAID) continue;
      confirmableItems.push(item);
    }

    if (confirmableItems.length === 0) {
      throw new ForbiddenException('没有可确认收货的订单项');
    }

    await this.orderItemRepo.update(
      { id: In(confirmableItems.map((i) => i.id)) },
      { shippingStatus: ShippingStatus.RECEIVED, receivedAt: now },
    );

    return {
      confirmedCount: confirmableItems.length,
      skippedCount: orderItemIds.length - confirmableItems.length,
    };
  }

  // *申请售后（OrderItem 级别）
  async applyAfterSale(payload: JwtPayloadType, orderItemIds: string[]) {
    const { id: userId } = payload;
    const merchant = await this.merchantRepo.findOne({
      where: { userId: userId.toString() },
      select: ['id'],
    });

    if (!merchant) {
      throw new ForbiddenException('当前用户不是商户');
    }

    const items = await this.orderItemRepo.find({
      where: { id: In(orderItemIds) },
      relations: ['sku', 'sku.goods', 'order'],
    });

    if (items.length === 0) {
      throw new NotFoundException('未找到订单项');
    }

    const afterSaleItems: OrderItem[] = [];

    for (const item of items) {
      if (item.sku?.goods?.merchantId !== merchant.id) continue;
      // 只有已发货或已收货的订单项可以申请售后
      if (
        item.shippingStatus !== ShippingStatus.SHIPPED &&
        item.shippingStatus !== ShippingStatus.RECEIVED
      )
        continue;
      if (item.order?.status !== OrderStatus.PAID) continue;
      afterSaleItems.push(item);
    }

    if (afterSaleItems.length === 0) {
      throw new ForbiddenException('没有可申请售后的订单项');
    }

    await this.orderItemRepo.update(
      { id: In(afterSaleItems.map((i) => i.id)) },
      { shippingStatus: ShippingStatus.AFTER_SALE },
    );

    return {
      afterSaleCount: afterSaleItems.length,
      skippedCount: orderItemIds.length - afterSaleItems.length,
    };
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
