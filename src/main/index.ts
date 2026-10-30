// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

let win: BrowserWindow | null = null;
const smoke = process.argv.includes('--smoke');

// Squirrel 安装/卸载钩子：快捷方式的创建与删除由应用自己完成
function squirrelShortcuts(create: boolean) {
  const target = process.execPath;
  const links = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', '影子剪纸机.lnk'),
    path.join(process.env.USERPROFILE || '', 'Desktop', '影子剪纸机.lnk'),
  ];
  for (const lnk of links) {
    try {
      if (create) shell.writeShortcutLink(lnk, 'create', { target, description: '单光源影子剪纸规划器' });
      else if (fsSync.existsSync(lnk)) fsSync.unlinkSync(lnk);
    } catch { /* 单个快捷方式失败不阻断 */ }
  }
}

const squirrelArg = process.argv[1];
if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
  squirrelShortcuts(true);
  app.quit();
} else if (squirrelArg === '--squirrel-uninstall') {
  squirrelShortcuts(false);
  app.quit();
}

function senderCheck(e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }) {
  if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw Error('拒绝未知窗口');
}

/** 打印 HTML -> PDF（A4，无边距，页面由 <img> 精确铺满） */
async function htmlToPdf(html: string): Promise<Buffer> {
  const win2 = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win2.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 400)); // 等图片解码
    return await win2.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
  } finally {
    win2.destroy();
  }
}

function printHtml(pages: { dataUrl: string }[]): string {
  const body = pages
    .map((p) => `<div class="page"><img src="${p.dataUrl}"></div>`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    html,body { margin:0; padding:0; }
    .page { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .page img { width: 210mm; height: 297mm; display: block; }
  </style></head><body>${body}</body></html>`;
}

app.whenReady().then(async () => {
  if (!smoke) {
    ipcMain.handle('export-print-pdf', async (e, payload) => {
      senderCheck(e);
      if (!payload || !Array.isArray(payload.pages) || !payload.pages.length || payload.pages.length > 60)
        throw Error('打印页数据无效');
      for (const p of payload.pages)
        if (typeof p.dataUrl !== 'string' || !p.dataUrl.startsWith('data:image/png;base64,'))
          throw Error('打印页图片格式无效');
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '影子剪纸-裁剪图.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (r.canceled || !r.filePath) return null;
      const pdf = await htmlToPdf(printHtml(payload.pages));
      await fs.writeFile(r.filePath, pdf);
      return { path: r.filePath, bytes: pdf.length, pages: payload.pages.length };
    });

    ipcMain.handle('export-manual-pdf', async (e) => {
      senderCheck(e);
      const html = await fs.readFile(path.join(__dirname, '../manual.html'), 'utf8');
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '影子剪纸机-说明书.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (r.canceled || !r.filePath) return null;
      const pdf = await htmlToPdf(html);
      await fs.writeFile(r.filePath, pdf);
      return { path: r.filePath, bytes: pdf.length };
    });

    ipcMain.handle('save-png', async (e, dataUrl: unknown) => {
      senderCheck(e);
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,'))
        throw Error('图片数据无效');
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '影子剪纸-预览.png',
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (r.canceled || !r.filePath) return null;
      const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
      await fs.writeFile(r.filePath, buf);
      return { path: r.filePath, bytes: buf.length };
    });
  }

  if (smoke) {
    // 冒烟模式：保存对话框自动应答到固定临时路径
    const os = await import('node:os');
    const tmp = os.tmpdir();
    const queue = [
      path.join(tmp, `shadowcraft-smoke-print-${Date.now()}.pdf`),
      path.join(tmp, `shadowcraft-smoke-manual-${Date.now()}.pdf`),
    ].join('|');
    ipcMain.handle('export-print-pdf', async (e, payload) => {
      senderCheck(e);
      console.log('[smoke] export-print-pdf payload keys:', payload && Object.keys(payload), 'pages:', payload && Array.isArray(payload.pages) ? payload.pages.length : typeof payload?.pages);
      if (!payload || !Array.isArray(payload.pages) || !payload.pages.length) throw Error('打印页数据无效');
      const dest = queue.split('|')[0];
      const pdf = await htmlToPdf(printHtml(payload.pages));
      await fs.writeFile(dest, pdf);
      return { path: dest, bytes: pdf.length, pages: payload.pages.length };
    });
    ipcMain.handle('export-manual-pdf', async (e) => {
      senderCheck(e);
      const html = await fs.readFile(path.join(__dirname, '../manual.html'), 'utf8');
      const dest = queue.split('|')[1];
      const pdf = await htmlToPdf(html);
      await fs.writeFile(dest, pdf);
      return { path: dest, bytes: pdf.length };
    });
    ipcMain.on('smoke-ready', (e, payload) => {
      try {
        senderCheck(e);
        console.log('[smoke] renderer ready, mounted=' + payload.mounted + ' geometryOk=' + payload.geometryOk);
        if (!payload.mounted || !payload.geometryOk) { app.exit(1); return; }
        // 渲染进程执行真实 PDF 导出（星形影子 + 默认摆位），结果回传校验
        win!.webContents.send('smoke:run');
      } catch { app.exit(1); }
    });
    ipcMain.handle('smoke:result', async (e, payload) => {
      try { senderCheck(e); } catch { app.exit(1); return; }
      try {
        const r = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (r.error) throw Error('渲染进程报告: ' + r.error);
        for (const key of ['print', 'manual'] as const) {
          const item = r[key];
          if (!item?.path || !(item.bytes > 1000)) throw Error(key + ' 导出结果异常: ' + JSON.stringify(item));
          const buf = await fs.readFile(item.path);
          if (buf.length !== item.bytes) throw Error(key + ' 文件字节数不符');
          if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46))
            throw Error(key + ' 不是 PDF 文件头 (%PDF)');
          console.log(`[smoke] ${key} PDF ok: ${item.path} (${item.bytes} 字节, %PDF 头校验通过)`);
        }
        console.log('[smoke] ' + queue);
        console.log('SMOKE PASS');
        app.exit(0);
      } catch (err) {
        console.log('[smoke] FAIL: ' + String((err as Error).message ?? err));
        app.exit(1);
      }
    });
    setTimeout(() => { console.log('[smoke] 超时未收到渲染进程就绪'); app.exit(1); }, 60_000);
  }

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: !smoke,
    backgroundColor: '#faf7f2',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, '../renderer/index.html'), smoke ? { query: { smoke: '1' } } : undefined);
});

app.on('window-all-closed', () => app.quit());
