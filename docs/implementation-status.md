# 影子剪纸机 docs/implementation-status.md（追加式）

## 2026-10-29 初建（协调者直接开发）

本轮目标：按用户 2026-10-29 晚指令开发"影子剪纸机（单光源版）"，要求 ①大众审美级 UI 与零学习成本交互 ②零基础排版级 PDF 用户说明书 ③Windows 傻瓜式安装与系统级标准卸载 ④移动端评估与 Android APK 跨端交付。

### 已实现

- 工程骨架：Electron 44.9.3 + React 19 + TS，esbuild 构建（scripts/build.mjs），与 compression-microscope 同构（contextIsolation/sandbox/preload 窄接口）。
- 几何引擎 `src/domain/geometry.cjs`：单光源位似模型 P = L + (d/h)(S−L)，含 paperBounds、validate；`tests/geometry.test.cjs` 5 项（比例、不动点、单调、包围盒、校验）。
- 三步向导 UI（src/renderer/App.tsx）：选影子（6 内置形状 + 照片导入阈值剪影 + 反相）→ 摆灯和纸（三滑块，实时侧视图 SVG + 纸尺寸读数）→ 打印（A4 真实尺寸瓦片分页 + 拼接对齐记号 + 150dpi）。
- 说明书 `resources/manual.html`（零基础排版级：准备清单/三步/常见问题/安全提示/"它不是什么"/原理），经主进程 printToPDF 导出。
- 打印 PDF：渲染层瓦片 PNG → 主进程 printToPDF（@page A4，preferCSSPageSize）；另有纸样 PNG 另存。
- 冒烟：`npm run smoke`（--smoke 隐藏窗口 + 渲染进程 smoke-ready + 几何自检，退出码判定）。

### 尚未验证 / 未做

- npm install / build / test / smoke 全部未跑（工程刚落盘）。
- 打包（Squirrel，需沿用 make-offline + subst 方案）、安装/卸载实测、PDF 实际导出内容人工检查、真实打印尺寸校验。
- 移动端评估与 APK（单独文档）。

### 2026-10-29 实测结果（协调者执行）

- `npm test`：几何引擎 **5/5 通过**（比例、不动点、单调、包围盒、validate）。
- `npm run smoke`：**SMOKE PASS**（退出码 0）——真实 Electron 启动 → 渲染进程挂载 + 几何自检 → **真实导出两份 PDF 并落盘核验**：打印 PDF 12,429 字节、说明书 PDF 267,509 字节，均通过 %PDF 文件头校验与字节数复核。日志 `docs/smoke.log`。
  - 过程中修复两处实现错误：渲染层 smoke 调用 payload 形状（数组 → {pages} 包装）；冒烟模式处理器重复注册（non-smoke 处理器加 `if (!smoke)` 守卫）。
- **Squirrel 安装包构建成功**：`node scripts/make-offline.mjs make`（复用 compression 的离线镜像方案，`subst X:` 映射 ASCII 盘符），一次成功。产物 `out/make/squirrel.windows/x64/ShadowCraft-0.1.0 Setup.exe`。
- **安装/卸载实测 11/11**（`scripts/install-verify.py`，日志 `docs/install-verify.log`）：静默安装退出码 0；`%LOCALAPPDATA%\ShadowCraft\app-0.1.0\` 就位；HKCU 卸载项（DisplayName/DisplayVersion）；开始菜单+桌面快捷方式（`--squirrel-install` 钩子 `shell.writeShortcutLink` 创建——首版缺失导致 9/11，补钩子后全过）；从快捷方式启动窗口标题「影子剪纸机」经 FindWindowW 码位比对一致；`Update.exe --uninstall` 退出码 0、注册表清除、快捷方式删除；残留 `['.dead', 'app-0.1.0/(squirrel.exe)', 'Update.exe']` 与压缩 1.0.0 实测记录的 Squirrel 固有残留一致。
- 交付物：`交付物/ShadowCraft-0.1.0-Setup.exe`，155,279,872 字节，SHA-256 `9f97c51ad90bfad89f8de481cbec7a47143e25f8f9bce8f112aa3160e036b9a8`。

### 尚未验证

- UI 人工审美验收与真实打印输出的物理尺寸核对（需用户参与：打印后量纸的实际厘米数）。
- 照片导入剪影在多样照片上的效果（只验证了流程通路）。
- Android APK（见 `docs/mobile-eval.md`）。

## 2026-10-29 R-STD 收尾（TASK-SC-01 → 0.1.1）

猫猫初审问题单 `MAJOR-SC-01/02/03`、`MINOR-SC-04` 的收尾。功能逻辑零改动，改的是类型契约、工程文件与打包配置。

### 改了什么

| 文件 | 改动 |
|---|---|
| `src/domain/geometry.d.cts` | 新增。为 `geometry.cjs` 补类型声明（`Point`/`Bounds`/`wallToPaper`/`paperBounds`/`validate`），消除 `TS7016` |
| `src/renderer/App.tsx` | `Window.shadowcraft` 接口补齐 `onSmokeRun`、`smokeResult`；`exportPrintPdf` 参数类型改为 `{ pages: {...}[] } \| {...}[]`，与主进程实际接收的 `{ pages }` 对齐 |
| `package.json` | `version` 0.1.1；`author` → `Over9rowth`；新增 `typecheck`、`manual`；`build` 前置 `tsc --noEmit`；补 `appCopyright`/`appVersion`/`icon`/`win32metadata`；`ignore` 增加 `^/resources`、`^/node_modules`、`^/out`、`^/out-`；squirrel maker 补 `setupIcon` |
| `README.md`、`LICENSE`、`.gitignore`、`.gitattributes` | 新增（README 含「它不是什么」；LICENSE 为 MIT + `Copyright (c) 2026 Over9rowth`） |
| `resources/icon.svg` + 7 张 PNG + `icon.ico` | 新增。深色圆角底 + 琥珀小圆片（遮光纸）+ 更大的石板蓝圆（墙上的影子） |
| `scripts/make-icon.mjs`、`scripts/make-manual-pdf.mjs` | 新增。图标渲染借隔壁 sharp；说明书 PDF 可复现生成 |
| `scripts/smoke.mjs` | 冒烟启动补 `--disable-gpu` 等参数（见下） |
| `docs/install-verify.log`、`docs/make.log`、`docs/make2.log`、`docs/smoke.log` | 脱敏 9 处本机用户目录字面量 → `<用户目录>`，另脱敏 1 处百分号编码的 `file:///` 工程绝对路径 → `file:///<工作树>/` |

### 已实测（2026-10-29 21:00—21:15）

1. `npx tsc --noEmit` → **0 错**（修前 6 错：1 处 TS7016 + 2 处 `onSmokeRun` + 1 处 `{pages}` + 2 处 `smokeResult`）。
2. `npm test` → **5/5 通过**（257 ms）。
3. `npm run build` → `tsc --noEmit && node scripts/build.mjs`，`build ok`。
4. `npm run smoke` → **SMOKE PASS**：渲染进程挂载 + 几何自检通过；真实导出打印 PDF **12,429 字节**、说明书 PDF **267,509 字节**，均通过 `%PDF` 头与字节数复核。日志 `docs/smoke-0.1.1.log`。
5. 打包 → `ShadowCraft-0.1.1 Setup.exe` **154,041,344 字节**，sha256 `b3c39a769b81637f66cb308b832b39edef089aa97012356face17be83f538c03`。
6. exe 版本信息：`CompanyName Over9rowth` / `FileDescription 影子剪纸机` / `ProductName 影子剪纸机` / `FileVersion 0.1.1` / `ProductVersion 0.1.1` / `LegalCopyright Copyright (c) 2026 Over9rowth` / `OriginalFilename ShadowCraft.exe` / `InternalName ShadowCraft`。
7. 静默安装 → 退出码 0；`app-0.1.1\` 就位；注册表 `DisplayName 影子剪纸机`、`DisplayVersion 0.1.1`、**`Publisher Over9rowth`**（0.1.0 是 `Personal instruments`）。
8. 快捷方式：开始菜单 + 桌面「影子剪纸机.lnk」均存在。
9. 安装版 `--smoke` → **SMOKE PASS**（打印 PDF 12,429 B / 说明书 PDF 267,509 B，与源码树跑出来的字节数一致）。
10. 窗口标题：`影子剪纸机`，5 码位逐字一致（0x5f71 0x5b50 0x526a 0x7eb8 0x673a）。
11. 卸载 `Update.exe --uninstall` → 退出码 0；注册表键清除（`FileNotFoundError`）；两条 `.lnk` 删除；残留仅 `.dead`(1B) 与 `Update.exe`。
12. 说明书 PDF：`npm run manual` → 267,509 字节。
13. 本机路径复扫：本机用户名、盘符工程绝对路径、旧发布者署名在源码与 `docs/` 内 **0 命中**（`SPEC.md` 除外，见下方「待猫猫决定」）。

### 本轮踩到的坑

1. **冒烟在无 GPU 的会话里会崩**（同 loop-slicer）：`GPU process isn't usable. Goodbye.`。`scripts/smoke.mjs` 已显式带 `--disable-gpu --disable-gpu-sandbox --in-process-gpu --no-sandbox`。
2. **`loadFile` 处理不了中文路径**：说明书 PDF 生成改用 `data:text/html` 载入（`scripts/make-manual-pdf.mjs`）。
3. 打包前把旧 `out/` 移出工程，并在 `ignore` 里加 `^/out`、`^/out-`，避免上一版产物被打进新包。

### 仍未验证

- 打印后纸张的物理厘米尺寸（需真打印机 + 尺量）。
- UI 审美与零学习成本的人工判定。
- 照片导入剪影在多样照片上的效果。
- Android APK（仅 `docs/mobile-eval.md` 评估）。
- PDF 逐页人工排版过目。
