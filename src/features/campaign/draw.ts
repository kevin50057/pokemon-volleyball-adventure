// 場上 canvas 共用的小畫筆：心、描邊字、血條、彩帶、星光、「砸下來」的大字
import { CONF, FONT, H, W } from './config';

type G = CanvasRenderingContext2D;

export function heart(g: G, x: number, y: number, s: number, on: boolean): void {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.8, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  g.closePath();
  g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  g.fillStyle = on ? '#FF3B5C' : 'rgba(255,255,255,0.28)'; g.fill();
}
/** maxW：太長就橫向壓扁到這個寬度（英文、韓文的字比繁中長；繁中原本的字都放得下，不受影響） */
export function label(g: G, text: string, x: number, y: number, size: number, color?: string, align?: CanvasTextAlign, maxW?: number): void {
  const mw = maxW || W - 12;
  g.font = '900 ' + size + 'px ' + FONT;
  g.textAlign = align || 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.max(2, size / 4); g.strokeStyle = '#000';
  g.strokeText(text, x, y, mw);
  g.fillStyle = color || '#fff'; g.fillText(text, x, y, mw);
}
export function bar(g: G, x: number, y: number, w: number, h: number, n: number, left: number, color: string, fromRight: boolean, flashFrom: number, flashK: number): void {
  const gap = 2, sw = (w - gap * (n - 1)) / n;
  g.fillStyle = '#000'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  for (let i = 0; i < n; i++) {
    const on = fromRight ? i >= n - left : i < left;
    g.fillStyle = on ? color : 'rgba(255,255,255,0.16)';
    g.fillRect(x + i * (sw + gap), y, sw, h);
    if (on) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + i * (sw + gap), y, sw, h * 0.35); }
    // 剛被打掉的那幾格：白閃後往下掉
    const was = fromRight ? i >= n - flashFrom : i < flashFrom;
    if (!on && was && flashK > 0) { g.globalAlpha = flashK; g.fillStyle = '#fff'; g.fillRect(x + i * (sw + gap), y + (1 - flashK) * 10, sw, h); g.globalAlpha = 1; }
  }
}
export function confetti(g: G, t: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = (i * 53 + Math.sin((t + i * 7) / 9) * 12 + 600) % W, y = ((t * (2.4 + (i % 4) * 0.7) + i * 41) % (H + 30)) - 20;
    g.save(); g.translate(x, y); g.rotate((t + i * 13) / (5 + (i % 3)));
    g.fillStyle = CONF[i % CONF.length]; g.fillRect(-3, -1.5, 6, 3); g.restore();
  }
}
export function star4(g: G, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
// 「砸下來」的大字：先放大再彈回原本大小
export function slam(g: G, text: string, x: number, y: number, size: number, color: string, age: number): void {
  const k = age < 4 ? 1 + (4 - age) * 0.5 : 1 + Math.max(0, 7 - age) * 0.03;
  g.save(); g.translate(x + (age >= 4 && age < 9 ? (age % 2 ? 2 : -2) : 0), y); g.transform(1, 0, -0.14, 1, 0, 0);
  label(g, text, 0, 0, size * k, color, 'center', (W - 12) * k); g.restore();   // 放大時寬度上限跟著放大，只在原本大小就放不下時才壓扁
}
