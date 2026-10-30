// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { wallToPaper, validate as validateGeo } from '../domain/geometry.cjs';

declare global {
  interface Window {
    shadowcraft: {
      // 主进程实际接收的是 { pages: [{ dataUrl }] }，见 src/main/index.ts 的 export-print-pdf
      exportPrintPdf: (
        payload: { pages: { dataUrl: string; label?: string }[] } | { dataUrl: string; label?: string }[],
      ) => Promise<{ path: string; bytes: number; pages: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      savePng: (dataUrl: string) => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; geometryOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: string) => Promise<unknown>;
    };
  }
}

const api = window.shadowcraft;
const WORK = 480; // 影子工作画布边长（像素）
const TILE_W_CM = 18, TILE_H_CM = 26.7, OVERLAP_CM = 1.2; // A4 可打印区与拼接重叠

/** 内置形状：多边形（0..1 归一化坐标，黑色=遮挡） */
const BUILTIN: { id: string; name: string; poly: [number, number][] }[] = [
  { id: 'star', name: '星星', poly: [[.5,.02],[.61,.36],[.98,.36],[.68,.58],[.79,.95],[.5,.72],[.21,.95],[.32,.58],[.02,.36],[.39,.36]] },
  { id: 'heart', name: '爱心', poly: [[.5,.95],[.12,.55],[.05,.32],[.2,.1],[.38,.12],[.5,.3],[.62,.12],[.8,.1],[.95,.32],[.88,.55]] },
  { id: 'cat', name: '小猫', poly: [[.2,.95],[.18,.6],[.25,.42],[.22,.15],[.36,.32],[.5,.28],[.64,.32],[.78,.15],[.75,.42],[.82,.6],[.8,.95]] },
  { id: 'tree', name: '小树', poly: [[.44,.95],[.44,.7],[.15,.68],[.3,.5],[.08,.48],[.3,.28],[.42,.3],[.5,.05],[.58,.3],[.7,.28],[.92,.48],[.7,.5],[.85,.68],[.56,.7],[.56,.95]] },
  { id: 'moon', name: '月亮', poly: [[.62,.03],[.3,.2],[.18,.5],[.3,.8],[.62,.97],[.42,.75],[.36,.5],[.42,.25]] },
  { id: 'crown', name: '皇冠', poly: [[.1,.9],[.1,.35],[.28,.55],[.38,.15],[.5,.5],[.62,.15],[.72,.55],[.9,.35],[.9,.9]] },
];

function drawMaskFromPoly(ctx: CanvasRenderingContext2D, poly: [number, number][]) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WORK, WORK);
  ctx.fillStyle = '#000'; ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * WORK, y * WORK) : ctx.moveTo(x * WORK, y * WORK)));
  ctx.closePath(); ctx.fill();
}

function maskBounds(mask: HTMLCanvasElement) {
  const d = mask.getContext('2d')!.getImageData(0, 0, WORK, WORK).data;
  let x0 = WORK, y0 = WORK, x1 = -1, y1 = -1;
  for (let y = 0; y < WORK; y++) for (let x = 0; x < WORK; x++) {
    if (d[(y * WORK + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { px0: x0, py0: y0, px1: x1, py1: y1 };
}

/** 影子目标尺寸（cm）：形状占墙宽度 targetWcm（用户可调），按掩码实际包围盒比例换算 */
function maskSizeCm(b: { px0: number; py0: number; px1: number; py1: number }, targetWcm: number) {
  const wpx = b.px1 - b.px0 + 1, hpx = b.py1 - b.py0 + 1;
  return { w: targetWcm, h: (hpx / wpx) * targetWcm };
}

function App() {
  const [step, setStep] = useState(1);
  const [shapeId, setShapeId] = useState<string>('star');
  const [targetWcm, setTargetWcm] = useState(30);       // 影子在墙上的宽度（cm）
  const [hCm, setHCm] = useState(100);                   // 灯到墙
  const [dCm, setDCm] = useState(20);                    // 纸到墙
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [imported, setImported] = useState<string | null>(null); // 导入图 dataURL
  const [status, setStatus] = useState('准备好啦：先选一个影子形状');
  const [busy, setBusy] = useState(false);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const paperRef = useRef<HTMLCanvasElement | null>(null);

  const usingImport = shapeId === 'import';

  /** 重建影子掩码 */
  const rebuildMask = useCallback(() => {
    let m = maskRef.current;
    if (!m) { m = document.createElement('canvas'); m.width = WORK; m.height = WORK; maskRef.current = m; }
    const ctx = m.getContext('2d')!;
    const b = BUILTIN.find((s) => s.id === shapeId);
    if (b) { drawMaskFromPoly(ctx, b.poly); return; }
    if (usingImport && imported) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = WORK; c.height = WORK;
        const x = c.getContext('2d')!;
        x.fillStyle = '#fff'; x.fillRect(0, 0, WORK, WORK);
        const s = Math.min(WORK / img.width, WORK / img.height);
        x.drawImage(img, (WORK - img.width * s) / 2, (WORK - img.height * s) / 2, img.width * s, img.height * s);
        const im = x.getImageData(0, 0, WORK, WORK); const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const dark = lum < threshold;
          const opaque = invert ? !dark : dark;
          const v = opaque ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        x.putImageData(im, 0, 0);
        ctx.clearRect(0, 0, WORK, WORK); ctx.drawImage(c, 0, 0);
        setStep((s0) => s0); // 触发预览刷新
      };
      img.src = imported;
      return;
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WORK, WORK);
  }, [shapeId, imported, threshold, invert, usingImport]);

  useEffect(() => { rebuildMask(); }, [rebuildMask]);

  const ratio = dCm / hCm;
  const mask = maskRef.current;
  const bounds = useMemo(() => (mask ? maskBounds(mask) : null), [mask, step, shapeId, imported, threshold, invert]);
  const sizeCm = bounds ? maskSizeCm(bounds, targetWcm) : null;
  const paperW = sizeCm ? sizeCm.w * ratio : 0;
  const paperH = sizeCm ? sizeCm.h * ratio : 0;
  const errors = dCm >= hCm ? ['纸到墙的距离要小于灯到墙的距离'] : [];

  /** 在目标画布上画"纸"（黑=要剪掉/涂黑的部分） */
  const drawPaper = useCallback((cv: HTMLCanvasElement, pxPerCm: number, showTileFrame?: { col: number; row: number; cols: number; rows: number }) => {
    if (!bounds || !mask) return;
    const b = bounds;
    // 影子包围盒中心定为墙坐标原点；灯在原点正上方墙前 hCm，水平位置同原点
    const cx = (b.px0 + b.px1) / 2, cy = (b.py0 + b.py1) / 2;
    const wCm = (b.px1 - b.px0 + 1) / WORK * targetWcm * ratio;
    const hCmP = (b.py1 - b.py0 + 1) / WORK * maskSizeCm(b, targetWcm).w / ((b.px1 - b.px0 + 1) / WORK) * ratio;
    void wCm; void hCmP;
    const x0 = cv.width, y0 = cv.height;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, x0, y0);
    g.save();
    // 画布坐标：纸中心在画布中心，比例 = 每厘米像素 × ratio（纸是影子的 ratio 倍缩小）
    g.translate(x0 / 2, y0 / 2);
    const scale = (pxPerCm * ratio) / (targetWcm / WORK);
    g.scale(scale, scale);
    g.translate(-cx, -cy);
    g.drawImage(mask, 0, 0);
    g.restore();
    if (showTileFrame) {
      const { col, row, cols, rows } = showTileFrame;
      g.strokeStyle = '#d8d2c6'; g.lineWidth = 2 * (96 / 150);
      const W = TILE_W_CM * pxPerCm, H = TILE_H_CM * pxPerCm;
      g.strokeRect(1, 1, W - 2, H - 2);
      g.fillStyle = '#8a847a'; g.font = `${13 * (96 / 150)}px sans-serif`;
      g.fillText(`第 ${row * cols + col + 1} 页 / 共 ${cols * rows} 页 · 顶部朝上`, 14, H - 14);
      // 对齐记号：四边中点小十字
      g.strokeStyle = '#b8b0a2';
      const mk = 10 * (96 / 150);
      [[W / 2, 1, 0, 1], [W / 2, H - 1, 0, -1], [1, H / 2, 1, 0], [W - 1, H / 2, -1, 0]].forEach(([x, y, dx, dy]) => {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + dx * mk, y + dy * mk);
        g.moveTo(x + dy * mk / 2, y + dx * mk / 2); g.lineTo(x - dy * mk / 2, y - dx * mk / 2);
        g.stroke();
      });
    }
  }, [bounds, mask, targetWcm, ratio]);

  /** 实时纸预览 */
  useEffect(() => {
    if (step < 2 || !paperRef.current) return;
    drawPaper(paperRef.current, 96 / 2.54); // 96dpi 下每厘米像素
  }, [step, drawPaper]);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImported(await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); }));
    setShapeId('import');
    setStatus('图片已载入，可以拖动下方的明暗滑块调整剪影效果');
  }

  function goStep3() {
    if (errors.length) { setStatus(errors.join('；')); return; }
    if (!bounds) { setStatus('还没有可用的影子形状'); return; }
    if (paperW > 120 || paperH > 120) { setStatus(`纸要 ${paperW.toFixed(0)}×${paperH.toFixed(0)} cm，比一张大桌子还大——建议把影子调小一点，或把纸放得离墙远一点（减小比例）`); return; }
    setStep(3); setStatus('可以打印啦');
  }

  async function onPrint() {
    if (!bounds || !mask) return;
    setBusy(true); setStatus('正在生成打印 PDF…');
    try {
      const wCm = paperW, hCmP = paperH;
      const cols = Math.max(1, Math.ceil((wCm - OVERLAP_CM) / (TILE_W_CM - OVERLAP_CM)));
      const rows = Math.max(1, Math.ceil((hCmP - OVERLAP_CM) / (TILE_H_CM - OVERLAP_CM)));
      const pxPerCm = 150 / 2.54;
      const pages: { dataUrl: string }[] = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const cv = document.createElement('canvas');
        cv.width = Math.round(TILE_W_CM * pxPerCm); cv.height = Math.round(TILE_H_CM * pxPerCm);
        const g = cv.getContext('2d')!;
        drawPaper(cv, pxPerCm, { col, row, cols, rows });
        void g;
        pages.push({ dataUrl: cv.toDataURL('image/png') });
      }
      const r = await api.exportPrintPdf(pages);
      setStatus(r ? `已保存：${r.path}（${r.pages} 页，打印后按页拼接）` : '已取消');
    } catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

  async function onManual() {
    setBusy(true);
    try { const r = await api.exportManualPdf(); setStatus(r ? `说明书已保存：${r.path}` : '已取消'); }
    catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

  async function onSavePng() {
    if (!paperRef.current) return;
    setBusy(true);
    try { const r = await api.savePng(paperRef.current.toDataURL('image/png')); setStatus(r ? `已保存：${r.path}` : '已取消'); }
    catch (err) { setStatus('出错了：' + String((err as Error).message ?? err)); }
    setBusy(false);
  }

  /** 冒烟：真实导出打印 PDF + 说明书 PDF（星形影子，默认摆位） */
  useEffect(() => {
    if (!api.onSmokeRun) return;
    api.onSmokeRun(() => {
      (async () => {
        try {
          const m = maskRef.current; if (!m) throw Error('掩码未就绪');
          const b = maskBounds(m); if (!b) throw Error('掩码为空');
          const cv = document.createElement('canvas');
          const pxPerCm = 150 / 2.54;
          cv.width = Math.round(18 * pxPerCm); cv.height = Math.round(26.7 * pxPerCm);
          const savedH = hCm, savedD = dCm;
          void savedH; void savedD; // 冒烟用组件当前值（默认 100/20）
          drawPaper(cv, pxPerCm, { col: 0, row: 0, cols: 1, rows: 1 });
          const pages = [{ dataUrl: cv.toDataURL('image/png') }];
          const print = await api.exportPrintPdf({ pages });
          const manual = await api.exportManualPdf();
          api.smokeResult(JSON.stringify({ print, manual }));
        } catch (err) {
          api.smokeResult(JSON.stringify({ error: String((err as Error).message ?? err) }));
        }
      })();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sideView = (
    <svg viewBox="0 0 340 150" style={{ width: '100%', background: '#fff', borderRadius: 10 }}>
      <line x1="300" y1="10" x2="300" y2="140" stroke="#b8b0a2" strokeWidth="6" />
      <text x="292" y="152" fontSize="11" fill="#8a847a">墙</text>
      <circle cx="30" cy="75" r="11" fill="#f6c445" stroke="#d9a520" />
      <text x="14" y="100" fontSize="11" fill="#8a847a">灯</text>
      {(() => {
        const wallX = 300, lightX = 30, lightY = 75;
        const px = lightX + (wallX - lightX) * (1 - dCm / hCm);
        return (<g>
          <line x1={lightX} y1={lightY} x2={wallX} y2="20" stroke="#f0c9a0" strokeWidth="1" />
          <line x1={lightX} y1={lightY} x2={wallX} y2="130" stroke="#f0c9a0" strokeWidth="1" />
          <rect x={px - 5} y="14" width="10" height="122" fill="#e8843c" opacity="0.85" />
          <text x={px - 14} y="152" fontSize="11" fill="#d06f28">纸</text>
          <text x={px + 10} y="152" fontSize="11" fill="#8a847a">{dCm} cm</text>
        </g>);
      })()}
      <text x="150" y="16" fontSize="11" fill="#8a847a">灯到墙 {hCm} cm</text>
    </svg>
  );

  return (
    <div className="app">
      <header>
        <span className="logo">🍪</span>
        <div>
          <h1>影子剪纸机</h1>
          <div className="sub">想要什么影子，告诉你剪一张什么样的纸（单灯版）</div>
        </div>
        <div className="spacer" />
        <button className="link" onClick={onManual} disabled={busy}>📄 查看图文说明书（PDF）</button>
      </header>

      <div className="steps">
        {['选影子', '摆灯和纸', '打印裁剪'].map((t, i) => (
          <div key={t} className={`step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
            <span className="n">{step > i + 1 ? '✓' : i + 1}</span>{t}
          </div>
        ))}
      </div>

      <main>
        <div className="panel">
          {step === 1 && <>
            <h2>第一步：影子想要什么样子？</h2>
            <p className="hint">点一个喜欢的形状，或用自己的照片变出剪影。</p>
            <div className="gallery">
              {BUILTIN.map((s) => (
                <div key={s.id} className={`shape-card ${shapeId === s.id ? 'sel' : ''}`}
                  onClick={() => { setShapeId(s.id); setStatus('选好了「' + s.name + '」，下一步摆灯和纸'); }}>
                  <canvas width={WORK} height={WORK} ref={(el) => { if (el) drawMaskFromPoly(el.getContext('2d')!, s.poly); }} />
                  <div className="name">{s.name}</div>
                </div>
              ))}
            </div>
            <div className="orline">—— 或者 ——</div>
            <div className="import-row">
              <label className="btn">导入图片变剪影<input type="file" accept="image/*" onChange={onImport} /></label>
              {usingImport && <button className="btn ghost" onClick={() => setShapeId(BUILTIN[0].id)}>改用内置形状</button>}
            </div>
            {usingImport && <>
              <div className="opt">明暗分界（拖到剪影看着最干净）<input type="range" min="20" max="235" value={threshold} onChange={(e) => setThreshold(+e.target.value)} /></div>
              <label className="check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />深浅反过来（浅色物体当影子时勾选）</label>
            </>}
            <div className="nextrow">
              <span />
              <button className="btn" disabled={!bounds} onClick={() => { setStep(2); setStatus('第二步：用两个滑块摆好灯和纸'); }}>下一步：摆灯和纸 →</button>
            </div>
          </>}

          {step === 2 && <>
            <h2>第二步：摆好灯和纸</h2>
            <p className="hint">两个滑块就是全部操作。纸离灯越近（比例越小），要剪的纸越小。</p>
            <div className="opt">影子在墙上的宽度：{targetWcm} cm<input type="range" min="10" max="120" value={targetWcm} onChange={(e) => setTargetWcm(+e.target.value)} /></div>
            <div className="opt">灯到墙的距离：{hCm} cm<input type="range" min="40" max="300" value={hCm} onChange={(e) => { const v = +e.target.value; setHCm(v); if (dCm >= v) setDCm(Math.max(5, Math.round(v / 3))); }} /></div>
            <div className="opt">纸到墙的距离：{dCm} cm<input type="range" min="5" max={hCm - 1} value={dCm} onChange={(e) => setDCm(+e.target.value)} /></div>
            {errors.length > 0 && <div className="warn">{errors.join('；')}</div>}
            <div className="readout">
              你要剪的纸：<b>{paperW.toFixed(1)} × {paperH.toFixed(1)} cm</b>
              （影子是纸的 {(1 / ratio).toFixed(1)} 倍大，因为灯光把纸放大了投影到墙上）
            </div>
            <div className="nextrow">
              <button className="btn ghost" onClick={() => setStep(1)}>← 上一步</button>
              <button className="btn" onClick={goStep3}>下一步：打印裁剪 →</button>
            </div>
          </>}

          {step === 3 && <>
            <h2>第三步：打印、裁剪、开灯</h2>
            <p className="hint">A4 纸打印（大图自动分页拼接，页边有对齐记号），把黑色部分剪掉镂空。</p>
            <div className="bigbtns">
              <button className="btn big" onClick={onPrint} disabled={busy}>🖨 生成打印 PDF（{paperW.toFixed(0)}×{paperH.toFixed(0)} cm{paperW > TILE_W_CM || paperH > TILE_H_CM ? '，自动分页' : ''}）</button>
              <button className="btn ghost" onClick={onSavePng} disabled={busy}>保存纸样图片（PNG）</button>
              <button className="btn ghost" onClick={onManual} disabled={busy}>📄 导出图文说明书（PDF）</button>
            </div>
            <p className="hint" style={{ marginTop: 14 }}>
              使用方法：把纸立在距墙 {dCm} cm 的位置，灯放在纸后 {hCm - dCm} cm 处（对准纸的正后方），关掉其他灯——墙上就会出现你的影子。
            </p>
            <div className="nextrow">
              <button className="btn ghost" onClick={() => setStep(2)}>← 上一步</button>
              <span />
            </div>
          </>}
        </div>

        <div className="preview-wrap">
          <div className="preview-card"><div className="t"><span>侧视图（灯 → 纸 → 墙）</span><span>比例示意</span></div>{sideView}</div>
          <div className="preview-card">
            <div className="t"><span>要剪的纸（黑色 = 剪掉镂空）</span><span>{paperW ? `${paperW.toFixed(1)}×${paperH.toFixed(1)} cm` : ''}</span></div>
            <canvas ref={paperRef} width={420} height={420} />
          </div>
          <div className="preview-card">
            <div className="t"><span>墙上的影子（效果预览）</span></div>
            <canvas width={420} height={300} ref={(el) => {
              if (!el || !mask) return;
              const g = el.getContext('2d')!;
              g.fillStyle = '#f3ede2'; g.fillRect(0, 0, el.width, el.height);
              const s = Math.min((el.width - 40) / WORK, (el.height - 40) / WORK);
              g.drawImage(mask, (el.width - WORK * s) / 2, (el.height - WORK * s) / 2, WORK * s, WORK * s);
            }} />
          </div>
        </div>
      </main>

      <div className="statusline">{status}{busy ? ' …' : ''}</div>
    </div>
  );
}

// 冒烟自检：几何引擎核心性质
function geometrySelfTest(): boolean {
  const L = { x: 0, y: 0 };
  const p1 = wallToPaper({ x: 10, y: 0 }, L, 0.2);
  if (Math.abs(p1.x - 2) > 1e-9) return false;
  const p2 = wallToPaper({ x: 10, y: 10 }, L, 0.5);
  if (Math.abs(p2.x - 5) > 1e-9 || Math.abs(p2.y - 5) > 1e-9) return false;
  if (validateGeo(100, 120).length === 0) return false;   // d>=h 必须报错
  if (validateGeo(100, 20).length !== 0) return false;    // 正常组合必须合法
  return true;
}

createRoot(document.getElementById('root')!).render(<App />);
window.addEventListener('load', () => {
  if (new URLSearchParams(location.search).get('smoke') === '1') {
    setTimeout(() => {
      try { window.shadowcraft?.smokeReady({ mounted: !!document.getElementById('root')?.children.length, geometryOk: geometrySelfTest() }); }
      catch { /* 非冒烟环境 */ }
    }, 300);
  }
});
