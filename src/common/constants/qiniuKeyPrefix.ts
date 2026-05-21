/** 七牛云文件上传 Key 前缀统一管理 */

export const QINIU_KEY_PREFIX = {
  /** RAG 知识库文档 */
  RAG: (merchantId: string) => `rag/raw/${merchantId}`,
  /** 财务资源文档 */
  FINANCE: (merchantId: string) => `finance/raw/${merchantId}`,
  //   报告
  REPORT: (merchantId: string) => `report/raw/${merchantId}`,
} as const;
