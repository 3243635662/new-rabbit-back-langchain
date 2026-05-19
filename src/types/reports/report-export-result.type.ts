export type ReportExportResult = {
  format: 'pdf' | 'image' | 'html';
  fileName: string;
  contentType: string;
  buffer: Buffer;
};
