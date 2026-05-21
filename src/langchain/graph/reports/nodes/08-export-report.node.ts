import type { RunnableConfig } from '@langchain/core/runnables';
import type { FinanceReportGraphState } from '../finance-report.annotation';
import type { ReportExportResult } from '../../../../types/reports/report-export-result.type';
import type { QiniuService } from '../../../../modules/qiniu/qiniu.service';
import type { FinanceReportNodeDeps } from '../../../../types/reports/finance-report-node-deps.type';
import { FinanceReportProgressPhase } from '../../../../types/reports/report-status.type';
import * as fsp from 'fs/promises';
import * as path from 'path';

/* ---------- 辅助函数 ---------- */

const getContentType = (format: 'pdf' | 'image' | 'html'): string => {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'image') return 'image/png';
  return 'text/html; charset=utf-8';
};

const getFileName = (
  format: 'pdf' | 'image' | 'html',
  startDate: string,
  endDate: string,
): string => {
  const ext = format === 'image' ? 'png' : format;
  const safeStart = startDate.slice(0, 10);
  const safeEnd = endDate.slice(0, 10);
  return `finance-report-${safeStart}-${safeEnd}-${Date.now()}.${ext}`;
};

/** 上传 Buffer 到七牛云 */
const uploadToQiniu = async (
  qiniuService: QiniuService | undefined,
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<{ url?: string; key?: string }> => {
  if (!qiniuService?.uploadBuffer) return {};

  const url = await qiniuService.uploadBuffer(buffer, key, contentType);
  return { url, key };
};

/** 调试开关：将 HTML 保存到本地 .report-debug 目录 */
const writeDebugHtml = async (
  html: string,
  fileName: string,
): Promise<void> => {
  if (process.env.REPORT_DEBUG_HTML !== 'true') return;

  const debugDir = path.join(process.cwd(), '.report-debug');
  await fsp.mkdir(debugDir, { recursive: true });

  const htmlName = fileName.replace('.pdf', '.html').replace('.png', '.html');
  await fsp.writeFile(path.join(debugDir, htmlName), html, 'utf-8');
};

/* ---------- 节点入口 ---------- */

/**
 * 节点八：导出报表文件
 *
 * 职责：
 * - 根据 exportFormat 将 state.html 导出为 pdf / image / html
 * - pdf/image 通过 Playwright (reportRenderService) 渲染
 * - html 直接 Buffer.from
 * - 上传到七牛云（如有 qiniuService）
 * - 写入 state.exportResult
 *
 * 输入：state.html, state.request.exportFormat, config.configurable
 * 输出：state.exportResult, state.logs
 * 异常：html 不存在、格式不支持、renderService 缺失时直接抛出错误
 */
export const buildExportReportNode = (deps: FinanceReportNodeDeps) => {
  return async (
    state: FinanceReportGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<FinanceReportGraphState>> => {
    const html = state.html;
    if (!html) {
      throw new Error('节点八：报表 HTML 不存在，无法导出文件');
    }

    const pushProgress = config?.configurable?.pushProgress as
      | ((progress: number, status: string, message: string) => Promise<void>)
      | undefined;
    const format = state.request.exportFormat;
    const fileName = getFileName(
      format,
      state.request.startDate,
      state.request.endDate,
    );
    const contentType = getContentType(format);

    // 调试开关：保存 HTML 到本地
    await writeDebugHtml(html, fileName);

    let buffer: Buffer;

    if (format === 'html') {
      buffer = Buffer.from(html, 'utf-8');
    } else if (format === 'pdf') {
      if (!deps.reportRenderService) {
        throw new Error('节点八：未提供 reportRenderService，无法导出 PDF');
      }
      await pushProgress?.(
        94,
        FinanceReportProgressPhase.RENDERING,
        '正在渲染 PDF 报表...',
      );
      buffer = await deps.reportRenderService.htmlToPdfBuffer(html);
    } else if (format === 'image') {
      if (!deps.reportRenderService) {
        throw new Error('节点八：未提供 reportRenderService，无法导出图片');
      }
      await pushProgress?.(
        94,
        FinanceReportProgressPhase.RENDERING,
        '正在渲染报表截图...',
      );
      buffer = await deps.reportRenderService.htmlToImageBuffer(html);
    } else {
      throw new Error(`节点八：不支持的导出格式: ${String(format)}`);
    }

    // 上传七牛
    const reportKey = `report/${Date.now()}-${fileName}`;
    await pushProgress?.(
      96,
      FinanceReportProgressPhase.UPLOADING,
      '正在上传报表文件至云端...',
    );
    const uploaded = await uploadToQiniu(
      deps.qiniuService,
      buffer,
      reportKey,
      contentType,
    );

    const exportResult: ReportExportResult = {
      format,
      fileName,
      contentType,
      buffer,
      size: buffer.length,
      url: uploaded.url,
      key: uploaded.key,
    };

    return {
      exportResult,
      logs: [
        `节点八：报表导出完成，格式: ${format}，文件名: ${fileName}，大小: ${String(buffer.length)} bytes` +
          (uploaded.url ? `，已上传七牛` : ''),
      ],
    };
  };
};
