# 移动端评估：三款新工具（Android 跨端交付）

日期：2026-10-29。评估人：协调者（本机实测探测）。

## 本机 Android 构建条件实测

| 条件 | 状态 |
|---|---|
| JDK | **未安装**（`java` 不在 PATH） |
| Android SDK | **未安装**（`%LOCALAPPDATA%\Android\Sdk` 不存在） |
| ffmpeg | 未安装（无影响，三款均不用） |
| 网络 | GitHub 间歇 502；Google 下载源未测 |

结论（诚实声明）：**本轮未产出 Android APK**。从零搭建 Android 工具链（JDK 17 + cmdline-tools + platform/build-tools + Gradle，合计约 1 GB 下载）在当前网络条件下风险高、耗时长，且未经验证的安装包不应宣称"已交付"。APK 是"未验证"状态，不是"完成"。

## 逐工具评估

### 1. 影子剪纸机（shadow-craft）——最适合跨端

- 桌面实现全部为浏览器能力（Canvas + DOM + 纯几何），**零 Node 依赖、零原生模块**。
- Android 路径：Capacitor 包装（同一套 React 代码）；PDF 导出在移动端可用系统打印服务或直接生成 PDF 下载。
- 工作量估计：UI 适配（触控目标已达标，向导式交互天然适配竖屏）＋ Capacitor 配置 ≈ 1 天。
- 风险：printToPDF 是 Electron 专有 API，需换 jsPDF 或 HTML 打印流。

### 2. 现实循环切片机（loop-slicer）——可行但重

- 抽帧/评分/交叉溶解全为 Canvas 能力；导出用 MediaRecorder（Android WebView 支持）。
- 风险：移动端视频解码 seek 性能与 MediaRecorder 编码器可用性需真机验证；大视频内存保护阈值需按移动端收紧。
- 工作量估计：2–3 天（含真机调优）。

### 3. 微动放大镜（motion-magnifier）——最重

- 逐像素时域滤波是 CPU 密集；移动端需降分辨率（≤240px）且处理时间显著变长。
- 建议移动端先做"拍摄→传到桌面处理"或砍时长上限（≤8 秒）。

## 建议路径

1. 先交付三款 Windows 桌面版（本轮）。
2. Android 第一件做影子剪纸机（Capacitor 包装，风险最小）。
3. 工具链一次性搭好（JDK+SDK），三件复用。

## 状态

- [x] 移动端评估（本文件）
- [ ] Android APK 交付——**未验证**（工具链未装，见上）
