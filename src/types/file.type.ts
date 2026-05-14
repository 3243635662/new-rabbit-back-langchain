/** 文档类型枚举 */
export enum DocType {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  EXCEL = 'excel',
  IMAGE = 'image',
}

/** 七牛云上传预签名结果 */
export interface PresignResult {
  uploadToken: string;
  key: string;
  domain: string;
}

/** 确认上传请求体 */
export interface ConfirmBody {
  qiniuKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sourceType: 'img' | 'invoice' | 'contract'; // 业务资源类型
}
export const ALLOWED_MIME_MAP: Record<string, DocType> = {
  'application/json': DocType.JSON,
  'text/csv': DocType.CSV,
  'application/pdf': DocType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    DocType.DOCX,
  'text/plain': DocType.TXT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    DocType.EXCEL,
  'application/vnd.ms-excel': DocType.EXCEL,
  'image/jpeg': DocType.IMAGE,
  'image/png': DocType.IMAGE,
  'image/webp': DocType.IMAGE,
};

/** 财务模块上传：仅 png / jpg(jpeg) / pdf / docx */
export const FINANCE_ALLOWED_MIME_MAP: Record<string, DocType> = {
  'image/png': DocType.IMAGE,
  'image/jpeg': DocType.IMAGE,
  'application/pdf': DocType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    DocType.DOCX,
};

/** 七牛 PutPolicy.mimeLimit（与 FINANCE_ALLOWED_MIME_MAP 一致） */
export const FINANCE_UPLOAD_MIME_LIMIT = Object.keys(
  FINANCE_ALLOWED_MIME_MAP,
).join(';');
