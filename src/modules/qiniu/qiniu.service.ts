import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qiniu from 'qiniu';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as nodePath from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  ALLOWED_MIME_MAP,
  DocType,
  FINANCE_ALLOWED_MIME_MAP,
  PresignResult,
} from '../../types/file.type';
import { ReadableStream } from 'stream/web';
@Injectable()
export class QiniuService {
  private readonly logger = new Logger(QiniuService.name);
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
   * @param keyPrefix 七牛云 key 前缀
   * @param fileName
   * @param expires
   * @returns { uploadToken, key, domain }
   */
  generatePresign = (
    keyPrefix: string,
    fileName: string,
    mimeLimit?: string,
    expires: number = 3600,
  ): PresignResult => {
    const key = `${keyPrefix}/${Date.now()}-${fileName}`;
    const { token, domain } = this.generateUploadToken(key, expires, mimeLimit);
    return { uploadToken: token, key, domain: domain || '' };
  };

  /**
   * 生成客户端直传七牛的 uploadToken
   * 限定 key（覆盖上传）、文件类型、文件大小
   */
  generateUploadToken = (
    key: string,
    expires: number = 3600,
    mimeLimit?: string,
  ): { token: string; domain: string } => {
    const defaultMimeLimit =
      'application/json;text/csv;application/pdf;application/vnd.openxmlformats-officedocument.wordprocessingml.document;text/plain;application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;application/vnd.ms-excel';

    const putPolicy = new qiniu.rs.PutPolicy({
      scope: `${this.bucket}:${key}`,
      expires,
      mimeLimit: mimeLimit || defaultMimeLimit,
      fsizeLimit: 1024 * 1024 * 50,
    });
    const token: string = putPolicy.uploadToken(this.mac);
    return { token, domain: this.domain };
  };

  /**
   * 验证七牛云文件：校验前缀、查询文件是否存在、校验文件类型
   * 验证失败时自动删除七牛云上的文件
   * @param allowedMimeMap 不传则使用全局知识库白名单；财务模块传入 FINANCE_ALLOWED_MIME_MAP
   * @returns 验证成功时返回文件信息 { qiniuUrl, actualMime, docType, fileSize }
   */
  validateFile = async (
    qiniuKey: string,
    expectedPrefix: string,
    mimeType: string,
    fileSize: number,
    allowedMimeMap: Record<string, DocType> = ALLOWED_MIME_MAP,
  ): Promise<{
    qiniuUrl: string;
    actualMime: string;
    docType: DocType;
    fileSize: number;
  }> => {
    // 校验 key 前缀安全（防止客户端传别人的 key）
    if (!qiniuKey.startsWith(expectedPrefix)) {
      throw new BadRequestException('qiniuKey 与前缀不匹配');
    }

    // 查询文件实际元信息，校验文件存在性
    const fileStat = await this.statFile(qiniuKey);
    if (!fileStat) {
      throw new BadRequestException('文件不存在于七牛云，请确认上传是否成功');
    }

    // 以七牛实际 mimeType 为准校验，客户端上报不一致则删文件
    const actualMime = fileStat.mimeType || mimeType;
    const docType = allowedMimeMap[actualMime];
    if (!docType) {
      await this.deleteFile(qiniuKey);
      this.logger.warn(`文件类型不支持: 实际=${actualMime}，已删除文件`);
      const hint =
        allowedMimeMap === FINANCE_ALLOWED_MIME_MAP
          ? '财务上传仅支持 png、jpg(jpeg)、pdf、docx'
          : '仅支持 json/csv/pdf/docx/txt/xlsx/xls';
      throw new BadRequestException(
        `不支持的文件类型: ${actualMime}，${hint}，文件已删除`,
      );
    }

    if (fileStat.mimeType && fileStat.mimeType !== mimeType) {
      await this.deleteFile(qiniuKey);
      this.logger.warn(
        `上报 mimeType=${mimeType}，实际=${fileStat.mimeType}，已删除文件`,
      );
      throw new BadRequestException(
        `文件类型不一致：上报 ${mimeType}，实际 ${fileStat.mimeType}，文件已删除`,
      );
    }

    const qiniuUrl = this.buildUrl(qiniuKey);
    return {
      qiniuUrl,
      actualMime,
      docType,
      fileSize: fileStat.fsize || fileSize,
    };
  };

  /**
   * 根据 qiniuKey 拼出完整访问 URL
   */
  buildUrl = (key: string): string => {
    return this.domain ? `${this.domain}/${key}` : `${this.bucket}/${key}`;
  };

  /**
   * @description 查询七牛文件元信息（mimeType、fsize 等）
   * 用于 confirm 时校验客户端上报的 mimeType 是否与实际一致
   */
  statFile = (
    key: string,
  ): Promise<{ mimeType: string; fsize: number } | null> => {
    const bucketManager = new qiniu.rs.BucketManager(
      this.mac,
      new qiniu.conf.Config(),
    );

    return new Promise((resolve) => {
      void bucketManager.stat(this.bucket, key, (err, respBody, respInfo) => {
        if (err) {
          resolve(null);
          return;
        }
        const info = respInfo as { statusCode: number };
        if (info.statusCode !== 200) {
          resolve(null);
          return;
        }
        const body = respBody as Record<string, unknown>;
        resolve({
          mimeType: (body?.mimeType as string) || '',
          fsize: (body?.fsize as number) || 0,
        });
      });
    });
  };

  /**
   * 删除七牛云上的文件（校验不通过时清理恶意文件）
   */
  deleteFile = (key: string): Promise<boolean> => {
    const bucketManager = new qiniu.rs.BucketManager(
      this.mac,
      new qiniu.conf.Config(),
    );

    return new Promise((resolve) => {
      void bucketManager.delete(
        this.bucket,
        key,
        (err, _respBody, respInfo) => {
          if (err) {
            resolve(false);
            return;
          }
          const info = respInfo as { statusCode: number };
          resolve(info.statusCode === 200);
        },
      );
    });
  };

  /**
   * 生成带签名的私有下载 URL（兼容公开/私有 bucket）
   */
  private getSignedDownloadUrl = (key: string, expires = 3600): string => {
    if (!this.domain) throw new Error('未配置 QINIU_DOMAIN，无法下载');

    const bucketManager = new qiniu.rs.BucketManager(
      this.mac,
      new qiniu.conf.Config(),
    );
    const deadline = Math.floor(Date.now() / 1000) + expires;
    return bucketManager.privateDownloadUrl(this.domain, key, deadline);
  };

  /**
   * 从七牛云下载文件到流式写入本地临时路径（Worker 解析时使用）
   */
  downloadToLocal = async (key: string, localPath: string): Promise<void> => {
    const url = this.getSignedDownloadUrl(key);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(
        `七牛云下载失败: HTTP ${response.status} ${response.statusText}`,
      );
    }

    await fsp.mkdir(nodePath.dirname(localPath), { recursive: true });
    // 可写流
    const fileStream = fs.createWriteStream(localPath);

    // 使用流式下载写入
    await pipeline(
      Readable.fromWeb(response.body as unknown as ReadableStream),
      fileStream,
    );
  };
}
