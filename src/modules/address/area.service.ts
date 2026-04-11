import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Area } from './entities/area.entity';

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(Area)
    private readonly areaRepo: Repository<Area>,
  ) {}

  /**
   * 根据父级ID获取下级区划列表（级联选择用）
   * @param pid 父级ID，0 表示查省级
   */
  async getChildren(pid = 0) {
    return this.areaRepo.find({
      where: { pid },
      order: { id: 'ASC' },
    });
  }

  /**
   * 根据行政区划编码获取单个区划
   */
  async getByCode(extId: string) {
    return this.areaRepo.findOne({ where: { extId } });
  }

  /**
   * 批量根据编码获取名称（用于 Address 列表回填）
   */
  async getNamesByCodes(codes: string[]) {
    if (!codes || codes.length === 0) return {};
    const areas = await this.areaRepo.find({
      where: codes.map((code) => ({ extId: code })),
    });
    return Object.fromEntries(areas.map((a) => [a.extId, a.name]));
  }

  /**
   * 模糊搜索区划（支持拼音首字母和名称）
   */
  async search(keyword: string, limit = 20) {
    if (!keyword || keyword.trim().length === 0) return [];
    const kw = keyword.trim();
    return this.areaRepo.find({
      where: [
        { name: Like(`%${kw}%`) },
        { pinyinPrefix: Like(`%${kw}%`) },
        { pinyin: Like(`%${kw}%`) },
      ],
      take: limit,
      order: { deep: 'ASC', id: 'ASC' },
    });
  }

  /**
   * 根据区划编码追溯完整层级路径
   * 返回 { province, city, district, street } 的 Area 对象
   */
  async getFullAreaPath(extId: string): Promise<{
    province: Area | null;
    city: Area | null;
    district: Area | null;
    street: Area | null;
  }> {
    const result = {
      province: null as Area | null,
      city: null as Area | null,
      district: null as Area | null,
      street: null as Area | null,
    };

    const area = await this.areaRepo.findOne({ where: { extId } });
    if (!area) return result;

    // 按层级直接赋值，然后沿 pid 向上追溯
    const deepMap: Record<number, keyof typeof result> = {
      0: 'province',
      1: 'city',
      2: 'district',
      3: 'street',
    };

    result[deepMap[area.deep]] = area;

    // 向上追溯（最多4层）
    let current = area;
    for (let i = 0; i < 4 && current.pid !== 0; i++) {
      const parent = await this.areaRepo.findOne({
        where: { id: current.pid },
      });
      if (!parent) break;
      result[deepMap[parent.deep]] = parent;
      current = parent;
    }

    return result;
  }
}
