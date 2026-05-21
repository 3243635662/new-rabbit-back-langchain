import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium, Page } from 'playwright';

@Injectable()
export class ReportRenderService implements OnModuleDestroy {
  private browser?: Browser;

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return this.browser;
  }

  private async waitForChartsRendered(page: Page): Promise<void> {
    await page
      .waitForFunction(
        () => {
          return Boolean(
            (window as unknown as { __REPORT_CHARTS_RENDERED__?: boolean })
              .__REPORT_CHARTS_RENDERED__,
          );
        },
        undefined,
        {
          timeout: 30000,
        },
      )
      .catch(() => undefined);
  }

  async htmlToPdfBuffer(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();

    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1800,
      },
    });

    try {
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      await this.waitForChartsRendered(page);

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '12mm',
          right: '10mm',
          bottom: '12mm',
          left: '10mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async htmlToImageBuffer(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();

    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 2200,
      },
      deviceScaleFactor: 2,
    });

    try {
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      await this.waitForChartsRendered(page);

      const image = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      return Buffer.from(image);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
    }
  }
}
