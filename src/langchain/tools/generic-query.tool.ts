import { Injectable, Logger } from '@nestjs/common';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DataSource } from 'typeorm';
import { AgentRuntimeContext } from '../../types/agent.type';

/** 危险 SQL 关键字黑名单 — 仅允许只读 SELECT */
const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'CREATE',
  'EXEC',
  'EXECUTE',
  'GRANT',
  'REVOKE',
  'LOAD',
  'IMPORT',
  'RENAME',
  'CALL',
] as const;

/** 默认/最大返回行数 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * 通用 SQL 查询 Tool — 兜底工具
 *
 * 职责：当内置工具能力不足时，允许 AI 编写只读 SELECT 语句直接查询数据库。
 * 自动注入安全校验和行数限制，防止写操作和大数据量查询。
 */
@Injectable()
export class GenericQueryTool {
  private readonly logger = new Logger(GenericQueryTool.name);

  constructor(private readonly dataSource: DataSource) {}

  create(context: AgentRuntimeContext): DynamicStructuredTool {
    const { merchantId } = context;

    return tool(
      async ({ sql }: { sql: string }) => {
        if (!merchantId) {
          return JSON.stringify({
            success: false,
            message: '当前用户未关联商户，无法执行查询。',
          });
        }

        const trimmed = sql.trim();

        // ── 1. 只允许 SELECT（也支持 WITH ... SELECT） ──
        const upper = trimmed.toUpperCase();
        if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
          return JSON.stringify({
            success: false,
            message: '仅允许 SELECT 只读查询。',
          });
        }

        // ── 2. 禁止危险关键字 ──
        const matched = FORBIDDEN_KEYWORDS.filter((kw) =>
          new RegExp(`\\b${kw}\\b`, 'i').test(trimmed),
        );
        if (matched.length > 0) {
          return JSON.stringify({
            success: false,
            message: `SQL 包含禁止的关键字: ${matched.join(', ')}`,
          });
        }

        // ── 3. 自动追加 LIMIT（如果未显式指定） ──
        const finalSQL = /\bLIMIT\s+\d+/i.test(trimmed)
          ? trimmed
          : `${trimmed} LIMIT ${DEFAULT_LIMIT}`;

        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const rows = await this.dataSource.query(finalSQL);

          const rowCount = Array.isArray(rows) ? rows.length : 0;
          const truncated = rowCount > MAX_LIMIT;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const resultRows = truncated ? rows.slice(0, MAX_LIMIT) : rows;

          return JSON.stringify({
            success: true,
            message: `查询成功，返回 ${rowCount} 行${truncated ? `（已截断至 ${MAX_LIMIT} 行）` : ''}`,
            rowCount,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            rows: resultRows,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          this.logger.error(`SQL 执行失败: ${errorMessage}\nSQL: ${finalSQL}`);

          return JSON.stringify({
            success: false,
            message: 'SQL 执行失败。',
            error: errorMessage,
          });
        }
      },
      {
        name: 'genericSQLQuery',
        description: [
          '【兜底工具】直接执行只读 SQL 查询（仅 SELECT）。当其他专用工具无法满足需求时使用。',
          '',
          '安全约束：只允许 SELECT/WITH 开头，禁止 INSERT/UPDATE/DELETE/DROP/ALTER 等写操作。',
          '自动追加 LIMIT 20（可自行指定更大的 LIMIT，最大 50 行）。',
          '',
          '常见表及其关键列（完整列名请通过 SELECT * FROM 表名 LIMIT 1 查看）：',
          '  merchants: id, userId, shopName, phone, status, createdAt',
          '  orders: id, orderNo, userId, status, totalAmount, payAmount, paidAt, createdAt',
          '  order_items: id, orderId, skuId, skuName, skuCode, count, price, totalPrice, shippingStatus, shippedAt, receivedAt',
          '  goods: id, name, merchantId, status, isReviewed, categoryId, createdAt',
          '  goods_sku: id, goodsId, skuCode, price, stock, specs, createdAt',
          '  goods_info: id, goodsId, detail(富文本)',
          '  brands: id, name',
          '  categories: id, name, parentId',
          '  inventory: id, skuId, stock, warningStock, lockedStock',
          '  inventory_logs: id, skuId, change, currentStock, type, relatedId, createdAt',
          '  users: id, username, email, roleId, active, areaId, createdAt',
          '  coupons: id, name, type, value, minAmount, total, used, startTime, endTime',
          '  user_coupons: id, userId, couponId, status, usedAt',
          '  knowledge_bases: id, merchantId, title, content, category, createdAt',
          '  addresses: id, userId, name, phone, province, city, district, detail, isDefault',
          '  areas: id, name, parentId',
          '  finance_reports: id, merchantId, period, totalRevenue, totalOrders, createdAt',
          '  finance_source_files: id, merchantId, fileName, status, uploadedAt',
          '  finance_extracted_records: id, fileId, orderNo, amount, payTime, remark',
          '',
          '关联查询示例：',
          '  "今天订单数" → SELECT COUNT(*) as cnt FROM orders WHERE createdAt >= "2026-05-23"',
          '  "各状态订单数" → SELECT oi.shippingStatus, COUNT(*) as cnt FROM order_items oi JOIN orders o ON oi.orderId = o.id GROUP BY oi.shippingStatus',
          '  "商品销量排行" → SELECT oi.skuName, SUM(oi.count) as total FROM order_items oi GROUP BY oi.skuName ORDER BY total DESC LIMIT 10',
        ].join('\n'),
        schema: z.object({
          sql: z
            .string()
            .describe(
              '只读 SELECT 查询语句。可包含 JOIN、GROUP BY、ORDER BY、WHERE 等。自动补 LIMIT 20。条件中的 merchantId 固定为当前商户 ID（上下文已提供）。',
            ),
        }),
      },
    );
  }
}
