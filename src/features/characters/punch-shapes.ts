// punch-shapes — 依屬性畫出不同形狀的殺球特效（40x40 像素風，黑色描邊，配合原作畫風）
// 只用程式畫幾何圖形，不使用任何外部圖檔。技能系統（abilities/ball-gfx.ts）會把結果做成 PIXI 貼圖。
// （舊版 punch-shapes.js → window.PV_PunchShapes）

const S = 40, C = 20;

type G = CanvasRenderingContext2D;
type ShapeFn = (g: G, main: string, light: string) => void;

function star(g: G, cx: number, cy: number, n: number, rOut: number, rIn: number, rot: number): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut, a = rot + i * Math.PI / n;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
}
function circle(g: G, x: number, y: number, r: number): void { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ring(g: G, x: number, y: number, r: number, w: number): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.arc(x, y, r - w, 0, Math.PI * 2, true); g.fill();
}
// 一滴「尖端朝 angle 方向」的水滴／火舌
function drop(g: G, cx: number, cy: number, a: number, dist: number, len: number, w: number): void {
  const tx = cx + Math.cos(a) * (dist + len), ty = cy + Math.sin(a) * (dist + len);
  const bx = cx + Math.cos(a) * dist, by = cy + Math.sin(a) * dist;
  const px = Math.cos(a + Math.PI / 2) * w, py = Math.sin(a + Math.PI / 2) * w;
  g.beginPath();
  g.moveTo(tx, ty);
  g.quadraticCurveTo(bx + px * 1.6, by + py * 1.6, bx, by);
  g.quadraticCurveTo(bx - px * 1.6, by - py * 1.6, tx, ty);
  g.fill();
  circle(g, bx, by, w);
}

const SHAPES: Record<string, ShapeFn> = {
  // 電：鋸齒閃電星芒
  '電': function (g, main, light) {
    g.fillStyle = main; star(g, C, C, 8, 19, 8, -Math.PI / 2);
    g.fillStyle = light; star(g, C, C, 8, 11, 5, -Math.PI / 2 + Math.PI / 8);
  },
  // 水：往外飛濺的圓水珠（尾巴朝中心）＋中間的漣漪
  '水': function (g, main, light) {
    g.fillStyle = main;
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 - Math.PI / 2, d = i % 2 ? 13 : 15, r = i % 2 ? 3 : 4;
      const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d;
      const px = Math.cos(a + Math.PI / 2) * r, py = Math.sin(a + Math.PI / 2) * r;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * 6, C + Math.sin(a) * 6);
      g.lineTo(x + px, y + py); g.lineTo(x - px, y - py); g.closePath(); g.fill();
      circle(g, x, y, r);
    }
    g.beginPath(); g.ellipse(C, C, 8, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = light;
    for (let j = 0; j < 7; j++) {
      const b = j * Math.PI * 2 / 7 - Math.PI / 2, e = j % 2 ? 13 : 15;
      circle(g, C + Math.cos(b) * e - 1, C + Math.sin(b) * e - 1, 1.3);
    }
    g.beginPath(); g.ellipse(C, C, 5, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = main; g.beginPath(); g.ellipse(C, C, 2.5, 1.6, 0, 0, Math.PI * 2); g.fill();
  },
  // 火：往外竄的火舌，內層黃色火心
  '火': function (g, main, light) {
    g.fillStyle = main;
    for (let i = 0; i < 7; i++) drop(g, C, C + 2, -Math.PI / 2 + (i - 3) * 0.55, 3, 15 - Math.abs(i - 3) * 1.5, 4.2);
    circle(g, C, C + 3, 9);
    g.fillStyle = light;
    for (let j = 0; j < 5; j++) drop(g, C, C + 3, -Math.PI / 2 + (j - 2) * 0.5, 1, 9 - Math.abs(j - 2), 2.6);
    circle(g, C, C + 4, 5);
    g.fillStyle = '#FFF6C8'; circle(g, C, C + 5, 2.5);
  },
  // 鬼：漩渦狀的煙霧團，中間空洞
  '鬼': function (g, main, light) {
    g.fillStyle = main;
    for (let i = 0; i < 9; i++) {
      const a = i * 0.75, d = 6 + i * 1.3;
      circle(g, C + Math.cos(a) * d, C + Math.sin(a) * d, 3 + i * 0.45);
    }
    g.fillStyle = light;
    for (let j = 0; j < 9; j += 2) {
      const b = j * 0.75, e = 6 + j * 1.3;
      circle(g, C + Math.cos(b) * e - 1, C + Math.sin(b) * e - 1, 1.2 + j * 0.15);
    }
    g.globalCompositeOperation = 'destination-out'; circle(g, C, C, 4); g.globalCompositeOperation = 'source-over';
  },
  // 超：同心念力波紋
  '超': function (g, main, light) {
    g.fillStyle = main; ring(g, C, C, 19, 3); ring(g, C, C, 12, 3);
    g.fillStyle = light; ring(g, C, C, 15.5, 2); circle(g, C, C, 5);
    g.fillStyle = main; circle(g, C, C, 2.5);
  },
  // 地：四散的碎石
  '地': function (g, main, light) {
    const rocks: [number, number, number][] = [[0, 13, 6], [1.1, 14, 5], [2.2, 12, 6], [3.2, 14, 5], [4.3, 13, 6], [5.3, 14, 4.5]];
    rocks.forEach(function (r) {
      const x = C + Math.cos(r[0]) * r[1], y = C + Math.sin(r[0]) * r[1], s = r[2];
      g.fillStyle = main;
      g.beginPath();
      g.moveTo(x - s, y + s * 0.4); g.lineTo(x - s * 0.3, y - s); g.lineTo(x + s, y - s * 0.3);
      g.lineTo(x + s * 0.6, y + s * 0.9); g.closePath(); g.fill();
      g.fillStyle = light;
      g.beginPath(); g.moveTo(x - s * 0.5, y); g.lineTo(x - s * 0.2, y - s * 0.6); g.lineTo(x + s * 0.4, y - s * 0.2); g.closePath(); g.fill();
    });
    g.fillStyle = main; circle(g, C, C, 5);
    g.fillStyle = light; circle(g, C - 1, C - 1, 2.5);
  },
  // 妖：閃亮的四角星
  '妖': function (g, main, light) {
    g.fillStyle = main; star(g, C, C, 4, 19, 4.5, -Math.PI / 2);
    star(g, C + 12, C - 11, 4, 6, 1.6, -Math.PI / 2);
    star(g, C - 12, C + 11, 4, 5, 1.4, -Math.PI / 2);
    star(g, C + 11, C + 12, 4, 4, 1.2, -Math.PI / 2);
    g.fillStyle = light; star(g, C, C, 4, 10, 2.5, -Math.PI / 2);
    g.fillStyle = '#FFFFFF'; circle(g, C, C, 2);
  },
  // 龍：三道爪痕
  '龍': function (g, main, light) {
    for (let i = -1; i <= 1; i++) {
      const ox = i * 9;
      g.fillStyle = main;
      g.beginPath();
      g.moveTo(C - 13 + ox, C - 17); g.quadraticCurveTo(C + 4 + ox, C - 4, C + 9 + ox, C + 18);
      g.quadraticCurveTo(C - 2 + ox, C - 1, C - 13 + ox, C - 17); g.fill();
      g.beginPath(); g.moveTo(C - 13 + ox, C - 17); g.quadraticCurveTo(C + 6 + ox, C - 6, C + 9 + ox, C + 18);
      g.quadraticCurveTo(C + 1 + ox, C - 4, C - 13 + ox, C - 17); g.fill();
      g.fillStyle = light;
      g.beginPath(); g.moveTo(C - 10 + ox, C - 13); g.quadraticCurveTo(C + 3 + ox, C - 3, C + 6 + ox, C + 12);
      g.quadraticCurveTo(C + ox, C - 3, C - 10 + ox, C - 13); g.fill();
    }
  },
  // 普：蓬鬆的撞擊煙團
  '普': function (g, main, light) {
    g.fillStyle = main;
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      circle(g, C + Math.cos(a) * 12, C + Math.sin(a) * 12, i % 2 ? 5 : 6.5);
    }
    circle(g, C, C, 12);
    g.fillStyle = light;
    for (let j = 0; j < 9; j += 2) {
      const b = j * Math.PI * 2 / 9;
      circle(g, C + Math.cos(b) * 12 - 1.5, C + Math.sin(b) * 12 - 1.5, 2);
    }
    circle(g, C - 3, C - 3, 4);
  },
};

// 把柔邊的向量圖轉成硬邊像素圖，再加 1px 黑框
function pixelize(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!, d = g.getImageData(0, 0, S, S), p = d.data;   // 2d context 一定拿得到（make 剛建好的 canvas）
  for (let i = 0; i < p.length; i += 4) p[i + 3] = p[i + 3] >= 110 ? 255 : 0;
  const solid = new Uint8Array(S * S);
  for (let k = 0; k < S * S; k++) solid[k] = p[k * 4 + 3] ? 1 : 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = y * S + x;
    if (solid[n]) continue;
    if ((x > 0 && solid[n - 1]) || (x < S - 1 && solid[n + 1]) || (y > 0 && solid[n - S]) || (y < S - 1 && solid[n + S])) {
      p[n * 4] = p[n * 4 + 1] = p[n * 4 + 2] = 0; p[n * 4 + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt); gg = Math.round(gg + (255 - gg) * amt); b = Math.round(b + (255 - b) * amt);
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
}

// type: 屬性字（電、水…）；color: 主色。回傳 40x40 canvas
function make(type: string, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;   // 剛建好的 canvas，2d context 一定拿得到
  (SHAPES[type] || SHAPES['電'])(g, color, lighten(color, 0.6));
  return pixelize(c);
}

export interface PunchShapes {
  make(type: string, color: string): HTMLCanvasElement;
  types: string[];
}

/** 舊版 window.PV_PunchShapes。 */
export const punchShapes: PunchShapes = { make: make, types: Object.keys(SHAPES) };
