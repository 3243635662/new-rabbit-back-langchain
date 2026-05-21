export type ReportExportResult = {
  format: 'pdf' | 'image' | 'html';
  fileName: string;
  contentType: string;
  buffer: Buffer;

  /** 七牛上传后的公开访问 URL */
  url?: string;
  /** 七牛云存储 key */
  key?: string;
  /** 文件大小（bytes） */
  size?: number;
};
