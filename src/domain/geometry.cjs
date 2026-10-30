// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
// 单光源影子剪纸几何。坐标约定（厘米，真实尺寸）：
//   墙面 z=0，纸面 z=d，光源 z=h，均平行于墙；0 < d < h。
//   光源水平位置 (Lx, Ly)。目标影子 S 定义在墙上（z=0）。
// 遮光纸的形状 = 影子形状经光源做的中心投影缩放（位似）：
//   P = L + (d/h) * (S - L)，比例 s = d/h，位似中心为光源的水平投影点。
// 推导：光线从 L 穿过墙上点 W(z=0)，在 z=d 处交点 X = L + t(W-L)，由 h(1-t)=d 得 t=(h-d)/h，
//   故 X_xy = L_xy + (d/h)(W_xy - L_xy)。
'use strict';

/** 位似映射：墙上点 -> 纸上点 */
function wallToPaper(point, light, ratio) {
  return {
    x: light.x + ratio * (point.x - light.x),
    y: light.y + ratio * (point.y - light.y),
  };
}

/** 给定影子目标包围盒（墙坐标 cm），计算纸的包围盒（纸坐标 cm） */
function paperBounds(shadowBounds, light, ratio) {
  const corners = [
    { x: shadowBounds.x0, y: shadowBounds.y0 },
    { x: shadowBounds.x1, y: shadowBounds.y0 },
    { x: shadowBounds.x0, y: shadowBounds.y1 },
    { x: shadowBounds.x1, y: shadowBounds.y1 },
  ].map((p) => wallToPaper(p, light, ratio));
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** 物理校验：返回错误消息数组（空数组 = 合法） */
function validate(h, d) {
  const errors = [];
  if (!(h > 0)) errors.push('灯到墙的距离必须大于 0');
  if (!(d > 0)) errors.push('纸到墙的距离必须大于 0');
  if (h > 0 && d >= h) errors.push('纸必须在灯和墙之间（纸到墙的距离要小于灯到墙的距离）');
  return errors;
}

/**
 * 光锥遮蔽预览参数：墙上某点被纸挡住的条件（点光源，硬阴影）：
 * 该点在纸上对应位置落在纸的不透明区域内。
 * 这里只给几何，不透明度由渲染层的光栅掩码决定。
 */

module.exports = { wallToPaper, paperBounds, validate };
