/** 文档类型枚举 */
export enum DocType {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  EXCEL = 'excel',
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
};
