import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Playwright 测试</title>
      </head>
      <body>
        <h1>Playwright 安装成功</h1>
        <p>如果你能看到这个 PDF，说明 Windows 本地环境已经跑通。</p>
        <script>
          window.__REPORT_CHARTS_RENDERED__ = true;
        </script>
      </body>
    </html>
  `);

  await page.pdf({
    path: 'test.pdf',
    format: 'A4',
    printBackground: true,
  });

  await browser.close();

  console.log('test.pdf 生成成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
