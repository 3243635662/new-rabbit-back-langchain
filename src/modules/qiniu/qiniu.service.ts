import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qiniu from 'qiniu';
import * as fsp from 'fs/promises';
import * as nodePath from 'path';

@Injectable()
export class QiniuService {
  private mac: qiniu.auth.digest.Mac;
  private bucket: string;
  private domain: string;

  constructor(private configService: ConfigService) {
    this.mac = new qiniu.auth.digest.Mac(
      this.configService.get<string>('QINIU_ACCESS_KEY'),
      this.configService.get('QINIU_SECRET_KEY'),
    );
    this.bucket = this.configService.get<string>('QINIU_BUCKET')!;
    this.domain = this.configService.get<string>('QINIU_DOMAIN') || '';
  }

  /**
   * 生成客户端直传七牛的 uploadToken
   * 限定 key（覆盖上传）、文件类型、文件大小
   */
  generateUploadToken = (
    key: string,
    expires: number = 3600,
  ): { token: string; domain: string } => {
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: `${this.bucket}:${key}`,
      expires,
      mimeLimit:
        'application/json;text/csv;application/pdf;application/vnd.openxmlformats-officedocument.wordprocessingml.document;text/plain',
      fsizeLimit: 1024 * 1024 * 50,
    });
    const token: string = putPolicy.uploadToken(this.mac);
    return { token, domain: this.domain };
  };

  /**
   * 根据 qiniuKey 拼出完整访问 URL
   */
  buildUrl = (key: string): string => {
    return this.domain ? `${this.domain}/${key}` : `${this.bucket}/${key}`;
  };

  /**
   * 从七牛云下载文件到本地临时路径（Worker 解析时使用）
   */
  downloadToLocal = async (key: string, localPath: string): Promise<void> => {
    if (!this.domain) throw new Error('未配置 QINIU_DOMAIN，无法下载');

    const url = `${this.domain}/${key}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `七牛云下载失败: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.mkdir(nodePath.dirname(localPath), { recursive: true });
    await fsp.writeFile(localPath, buffer);
  };
}
