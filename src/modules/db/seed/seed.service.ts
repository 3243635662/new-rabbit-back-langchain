import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Goods } from '../../goods/entities/goods.entity';
import { Categories } from '../../goods/entities/categories.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { GoodsSku } from '../../goods/entities/goods_sku.entity';
import { Role } from '../../role/entities/role.entity';
import { RedisService, BloomFilters } from '../redis/redis.service';
import { BcryptUtil } from '../../../utils/bcrypt.util';
import { HomeBanner } from '../../clientHome/entities/home-banner.entity';
import { HomeCategory } from '../../clientHome/entities/home-category.entity';
import {
  CarouselData,
  CarouselSideRecommendation,
} from '../../../composables/useClientHomeData';

interface SpecOption {
  name: string;
  value: string;
  picture?: string;
}

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Goods) private readonly goodsRepo: Repository<Goods>,
    @InjectRepository(Categories)
    private readonly categoryRepo: Repository<Categories>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(GoodsSku)
    private readonly skuRepo: Repository<GoodsSku>,
    @InjectRepository(HomeBanner)
    private readonly homeBannerRepo: Repository<HomeBanner>,
    @InjectRepository(HomeCategory)
    private readonly homeCategoryRepo: Repository<HomeCategory>,
    private readonly redisService: RedisService,
  ) {}

  //*初始化超级管理员
  async initAdmin() {
    const user = await this.userRepository.findOneBy({ username: 'admin' });
    if (user) {
      throw new BadRequestException('管理员已存在');
    }

    // 确保角色 ID 为 1 的角色存在（通常是超级管理员）
    let adminRole = await this.roleRepository.findOneBy({ id: 1 });
    if (!adminRole) {
      adminRole = await this.roleRepository.save({
        id: 1,
        name: '超级管理员',
        value: 'super_admin',
        desc: '拥有所有权限的账号',
      });
    }

    const newUser = this.userRepository.create({
      username: 'admin',
      password: await BcryptUtil.hash('123456', 10),
      email: 'fanfan0521@yeah.net',
      avatar:
        'https://www.dhs.tsinghua.edu.cn/wp-content/uploads/2025/03/2025031301575583.jpeg',
      roleId: adminRole.id,
      active: true,
      areaId: 0,
      remark: '系统初始化超级管理员',
    });

    const savedUser = await this.userRepository.save(newUser);
    // 同步更新布隆过滤器
    await this.redisService.addItem(BloomFilters.USER_IDS, savedUser.id);
    return { id: savedUser.id, username: savedUser.username };
  }

  // *初始化sku (根据商品的规格组合生成所有的 SKU)
  async initSku(): Promise<{ totalCreated: number }> {
    // 1. 获取所有商品及其关联的规格和规格值
    const goodsList = await this.goodsRepo.find({
      relations: ['specs', 'specs.values'],
    });

    let totalCreated = 0;

    for (const goods of goodsList) {
      // 如果该商品已经有 SKU 了，我们可以选择跳过或者先清空
      // 这里我们选择跳过有 SKU 的商品，保持幂等性
      const existingSkuCount = await this.skuRepo.count({
        where: { goodsId: goods.id },
      });
      if (existingSkuCount > 0) continue;

      // 提取规格组合
      // specsData 结构: [ [ {name, value, picture}, ... ], [ ... ] ]
      const specsData = goods.specs.map((spec) => {
        return spec.values.map((v) => ({
          name: spec.name,
          value: v.value,
          picture: v.picture, // 记录下图片，后续 SKU 可以使用
        }));
      });

      if (specsData.length === 0) continue;

      // 计算笛卡尔积，得到所有可能的组合
      const combinations = this.cartesianProduct(specsData);

      // 批量创建 SKU
      const skusToSave = combinations.map((combo, index) => {
        // combo 就是一组规格组合，形如: [ {name: '颜色', value: '红', picture: '...'}, {name: '尺寸', value: 'XL'} ]

        // 处理 SKU 主图: 取组合中第一个带有图片的规格图片 (通常是颜色规格)
        const skuPicture =
          combo.find((c: SpecOption) => c.picture)?.picture || undefined;

        const specList = combo.map((c: SpecOption) => ({
          name: c.name,
          value: c.value,
        }));

        return this.skuRepo.create({
          goodsId: goods.id,
          skuCode: `SKU-${goods.id}-${(index + 1).toString().padStart(3, '0')}`,
          price: 1999.0, // 初始默认价格，实际业务中可从 goods 表取基准价增加
          stock: 100, // 默认库存
          picture: skuPicture,
          specs: specList,
        });
      });

      if (skusToSave.length > 0) {
        await this.skuRepo.save(skusToSave);
        totalCreated += skusToSave.length;
      }
    }

    return { totalCreated };
  }

  /**
   * 笛卡尔积工具函数
   * @param arrays 二维数组
   */
  private cartesianProduct(arrays: SpecOption[][]): SpecOption[][] {
    return arrays.reduce(
      (acc, curr) => {
        const res: SpecOption[][] = [];
        acc.forEach((a) => {
          curr.forEach((b) => {
            res.push([...a, b]);
          });
        });
        return res;
      },
      [[]] as SpecOption[][],
    );
  }

  // *初始化首页数据
  async initHomeData() {
    // 1. 初始化轮播图
    const bannerCount = await this.homeBannerRepo.count();
    if (bannerCount === 0) {
      const banners = CarouselData.map((data, index) =>
        this.homeBannerRepo.create({
          ...data,
          sort: index,
          isActive: true,
        }),
      );
      await this.homeBannerRepo.save(banners);
    }

    // 2. 初始化分类侧边推荐
    const categoryCount = await this.homeCategoryRepo.count();
    if (categoryCount === 0) {
      const categories = CarouselSideRecommendation.map((data, index) =>
        this.homeCategoryRepo.create({
          ...data,
          sort: index,
          isActive: true,
        }),
      );
      await this.homeCategoryRepo.save(categories);
    }

    return { message: '首页数据初始化成功' };
  }
}
