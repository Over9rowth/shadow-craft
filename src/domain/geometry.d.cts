// 单光源影子剪纸几何的类型声明（对应 geometry.cjs）。
// 坐标约定：厘米，墙面 z=0、纸面 z=d、光源 z=h，0 < d < h。

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 位似映射：墙上点 → 纸上点，ratio = d/h */
export function wallToPaper(point: Point, light: Point, ratio: number): Point;

/** 给定影子目标包围盒（墙坐标），算出纸的包围盒（纸坐标） */
export function paperBounds(shadowBounds: Bounds, light: Point, ratio: number): Bounds;

/** 物理校验：返回错误消息数组，空数组表示合法 */
export function validate(h: number, d: number): string[];
