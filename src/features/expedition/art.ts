/**
 * 遠征面板上用程式畫的圖：路線地圖（天色跟著進度從清晨走到夜晚）、收服演出、通關明信片。
 * 角色圖一律用遊戲既有的素材（選角面板的頭像），這裡只畫幾何圖形。純顯示，不碰存檔和規則。
 */
import { svc } from '../../core/services';
import { heart, label, star4 } from '../campaign/draw';
import { STOPS, matchNode, nodeById } from './content';
import { rngFor } from './rng';

type G = CanvasRenderingContext2D;

const faces: Record<string, HTMLCanvasElement | null> = {};
/** 頭像（快取）；選角面板還沒好就回 null */
export function face(id: string): HTMLCanvasElement | null {
  if (faces[id]) return faces[id];
  try { const cs = svc.charSelect; if (cs) faces[id] = cs.portrait(id, 64); } catch { /* 素材還沒載好 */ }
  return faces[id] || null;
}
function drawFace(g: G, id: string, x: number, y: number, size: number, alpha = 1): void {
  const f = face(id);
  g.save(); g.globalAlpha *= alpha; g.imageSmoothingEnabled = false;
  if (f) g.drawImage(f, x - size / 2, y - size / 2, size, size);
  else { g.fillStyle = '#7d8cff'; g.beginPath(); g.arc(x, y, size / 3, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** 每一輪固定的隨機數（雲、星星的位置），由種子決定 */
export function sceneNumbers(seed: string): number[] {
  const r = rngFor(seed, 'map', 'event'), out: number[] = [];
  for (let i = 0; i < 64; i++) out.push(r.next());
  return out;
}

// 清晨 → 白天 → 午後 → 黃昏 → 夜晚
const SKY: readonly (readonly [string, string])[] = [['#F6A27A', '#FFE7C4'], ['#58B6F5', '#D9F2FF'], ['#4F9BE8', '#FFE6B8'], ['#6A4C93', '#FF9B6A'], ['#0A1233', '#3B2C6E']];
const HILL: readonly (readonly [string, string])[] = [['#7DBB7A', '#4E9160'], ['#6CC36A', '#3F9A55'], ['#74B85E', '#458E4C'], ['#5C8F62', '#35604A'], ['#2A4660', '#1A2E48']];

function sky(g: G, w: number, h: number, stage: number, nums: readonly number[], t: number): void {
  const s = Math.max(0, Math.min(4, stage)), gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, SKY[s][0]); gr.addColorStop(1, SKY[s][1]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (s === 4) {
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t / 40 + i * 1.7));
      g.fillStyle = '#fff'; g.fillRect(nums[i] * w, nums[i + 26] * h * 0.6, 1.5, 1.5);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#FFF6D6'; g.beginPath(); g.arc(w * 0.84, h * 0.2, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = SKY[4][0]; g.beginPath(); g.arc(w * 0.84 + 5, h * 0.2 - 3, 10, 0, Math.PI * 2); g.fill();
  } else {
    const k = s / 3, sx = w * (0.12 + 0.76 * k), sy = h * (0.42 - 0.3 * Math.sin(Math.PI * (0.15 + 0.7 * k)));
    g.globalAlpha = 0.25; g.fillStyle = '#FFF3B0'; g.beginPath(); g.arc(sx, sy, 20 + Math.sin(t / 30) * 2, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1; g.fillStyle = s === 3 ? '#FFD08A' : '#FFF6C8'; g.beginPath(); g.arc(sx, sy, 11, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  for (let c = 0; c < 4; c++) {
    const cx = ((nums[52 + c] * w + t * (0.08 + c * 0.03)) % (w + 80)) - 40, cy = h * (0.12 + nums[56 + c] * 0.25);
    g.globalAlpha = s === 4 ? 0.12 : 0.7;
    g.beginPath(); g.ellipse(cx, cy, 20, 6, 0, 0, Math.PI * 2); g.ellipse(cx + 12, cy - 4, 12, 6, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  for (let L = 0; L < 2; L++) {
    g.fillStyle = HILL[s][L]; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.52 + L * 0.14) + Math.sin(x / (46 - L * 14) + nums[60 + L] * 6) * (9 - L * 3));
    g.lineTo(w, h); g.closePath(); g.fill();
  }
}

export interface MapModel {
  nums: readonly number[];
  nodeId: string;
  visited: readonly string[];
  lead: string;
  hearts: number;
  maxHearts: number;
  ended: boolean;
  names: Record<string, string>;
}

function stopIndex(id: string): number {
  if (id === 'fork') return 1;
  for (let i = 0; i < STOPS.length; i++) if (STOPS[i].indexOf(id) >= 0) return i;
  return 0;
}
function pos(id: string, w: number, h: number): [number, number] {
  const i = stopIndex(id), x = w * (0.11 + 0.195 * i);
  const st = STOPS[i];
  if (st.length > 1 && id !== 'fork') return [x, h * (st.indexOf(id) === 0 ? 0.34 : 0.8)];
  return [x, h * 0.58];
}

export function drawMap(g: G, w: number, h: number, t: number, m: MapModel): void {
  const here = stopIndex(m.nodeId), atFork = m.nodeId === 'fork';
  sky(g, w, h, m.ended ? 4 : here, m.nums, t);
  const seen = (id: string): boolean => m.visited.indexOf(id) >= 0;
  const branch = STOPS[1].filter((id) => seen(id) || m.nodeId === id)[0];       // 已經選了哪一條
  const dim = (id: string): boolean => STOPS[1].indexOf(id) >= 0 && !!branch && branch !== id;
  // 路
  const seg = (a: string, b: string): void => {
    const [ax, ay] = pos(a, w, h), [bx, by] = pos(b, w, h), done = seen(a) && (seen(b) || m.nodeId === b);
    g.save();
    g.globalAlpha = dim(a) || dim(b) ? 0.18 : 1;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.setLineDash([]);
    g.beginPath(); g.moveTo(ax, ay + 2); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 6 + 2, bx, by + 2); g.stroke();
    g.strokeStyle = done ? '#FFE9A8' : 'rgba(255,255,255,0.75)'; g.lineWidth = 3.5;
    if (!done) { g.setLineDash([2, 7]); g.lineDashOffset = -t / 6; }
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 6, bx, by); g.stroke();
    g.restore();
  };
  seg('warmup', 'puddle'); seg('warmup', 'gold'); seg('puddle', 'supply'); seg('gold', 'supply'); seg('supply', 'elite'); seg('elite', 'boss');
  // 站
  STOPS.forEach((st) => st.forEach((id) => {
    const [x, y] = pos(id, w, h), n = nodeById(id), mn = matchNode(id);
    const done = seen(id), cur = !m.ended && (m.nodeId === id || (atFork && STOPS[1].indexOf(id) >= 0));
    const big = !!(mn && mn.boss), r = big ? 19 : 15;
    g.save();
    g.globalAlpha = dim(id) ? 0.3 : 1;
    if (cur) { g.globalAlpha *= 0.5 + 0.3 * Math.sin(t / 9); g.fillStyle = '#FFD54F'; g.beginPath(); g.arc(x, y, r + 6 + Math.sin(t / 9) * 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = dim(id) ? 0.3 : 1; }
    if (big) {         // 首領：轉動的尖刺外框
      g.fillStyle = '#B23A2E'; g.beginPath();
      for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10 + t / 90, rr = k % 2 ? r + 1 : r + 7; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    g.fillStyle = '#1d2140'; g.strokeStyle = done ? '#69F0AE' : cur ? '#FFD54F' : '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mn) drawFace(g, mn.opp, x, y, r * 1.7);
    else if (n && n.kind === 'supply') {   // 帳篷和營火
      g.fillStyle = '#FF8A65'; g.beginPath(); g.moveTo(x - 9, y + 6); g.lineTo(x - 1, y - 8); g.lineTo(x + 7, y + 6); g.closePath(); g.fill();
      g.fillStyle = '#4E2A1E'; g.beginPath(); g.moveTo(x - 3, y + 6); g.lineTo(x - 1, y - 1); g.lineTo(x + 1, y + 6); g.closePath(); g.fill();
      g.fillStyle = t % 12 < 6 ? '#FFD54F' : '#FF9800'; g.beginPath(); g.arc(x + 9, y + 4 - (t % 12 < 6 ? 1 : 0), 2.4, 0, Math.PI * 2); g.fill();
    }
    if (done) { g.fillStyle = '#69F0AE'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(x + r - 3, y - r + 3, 5.5, 0, Math.PI * 2); g.fill(); g.stroke(); label(g, '✓', x + r - 3, y - r + 3.5, 8, '#0B3D1E'); }
    label(g, m.names[id] || id, x, y + r + 9, 8.5, cur ? '#FFE082' : '#fff', 'center', 96);
    g.restore();
  }));
  // 夥伴站在目前的位置（岔路：站在路口）
  if (!m.ended) {
    let [px, py] = pos(m.nodeId, w, h);
    if (atFork) { const a = pos('warmup', w, h); px = (a[0] + px) / 2 + 6; py = a[1]; }
    else { px -= 22; py -= 12; }
    const hop = Math.abs(Math.sin(t / 10)) * 4;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px, py + 14, 9 - hop * 0.6, 2.5, 0, 0, Math.PI * 2); g.fill();
    drawFace(g, m.lead, px, py - hop, 28);
  }
  for (let i = 0; i < m.maxHearts; i++) heart(g, 14 + i * 15, 13, 5.5, i < m.hearts);
}

// ---------- 收服演出 ----------
function ballShape(g: G, x: number, y: number, r: number, rot: number): void {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.save(); g.clip();
  g.fillStyle = '#FFD54F'; g.beginPath(); g.arc(-r * 0.9, -r * 0.2, r * 0.85, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4FC3F7'; g.beginPath(); g.arc(r * 0.8, r * 0.7, r * 0.8, 0, Math.PI * 2); g.fill();
  g.restore();
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(Math.cos(k * 2.09) * r * 1.1, Math.sin(k * 2.09) * r * 1.1, r * 1.05, k * 2.09 + 2.3, k * 2.09 + 3.98); g.stroke(); }
  g.restore();
}

/** f：從開始算起的幀數（約每秒 30 幀）。回傳演完了沒。 */
export function drawCapture(g: G, w: number, h: number, f: number, t: number, nums: readonly number[], char: string, ok: boolean, text: string, sub: string): boolean {
  sky(g, w, h, 3, nums, t);
  const cx = w / 2, cy = h * 0.5, END = 88;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(cx, cy + 34, 30, 6, 0, 0, Math.PI * 2); g.fill();
  if (f < 18) {
    drawFace(g, char, cx, cy, 56);
    const k = f / 18;
    ballShape(g, 30 + (cx - 30) * k, cy + 30 - Math.sin(Math.PI * k) * 70 - 30 * k, 11, k * 9);
  } else if (f < 28) {
    const k = (f - 18) / 10;
    drawFace(g, char, cx, cy, 56 * (1 - k), 1 - k * 0.5);
    g.globalAlpha = 0.7 * (1 - k); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 34 * (1 - k) + 12, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    ballShape(g, cx, cy + k * 18, 11 + k * 4, 0);
  } else if (f < END) {
    const u = (f - 34) % 18, wob = f >= 34 && u < 12 ? Math.sin(u / 12 * Math.PI * 2) * 0.45 : 0;
    ballShape(g, cx + wob * 10, cy + 18, 15, wob);
  } else if (ok) {
    const k = Math.min(1, (f - END) / 14);
    ballShape(g, cx, cy + 18, 15, 0);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.3; star4(g, cx + Math.cos(a) * (20 + k * 34), cy + 18 + Math.sin(a) * (14 + k * 24), 6 * (1 - k * 0.5), i % 2 ? '#FFD54F' : '#fff'); }
    label(g, text, cx, h * 0.14, 17, '#FFE082', 'center', w - 20);
    label(g, sub, cx, h * 0.14 + 20, 10.5, '#fff', 'center', w - 20);
  } else {
    const k = Math.min(1, (f - END) / 22);
    ballShape(g, cx - 12 - k * 8, cy + 20, 13, -0.5 - k);
    drawFace(g, char, cx + k * (w / 2 + 40), cy - Math.abs(Math.sin(k * 9)) * 10, 56);
    label(g, text, cx, h * 0.14, 12.5, '#fff', 'center', w - 20);
  }
  return f > END + 26;
}

// ---------- 明信片 ----------
export interface Postcard {
  title: string; runName: string; headline: string; cleared: boolean;
  party: readonly string[]; visited: readonly string[]; names: Record<string, string>;
  hearts: number; maxHearts: number; lines: readonly string[]; date: string; nums: readonly number[];
}
export function drawPostcard(g: G, w: number, h: number, p: Postcard): void {
  sky(g, w, h, p.cleared ? 4 : 3, p.nums, 0);
  if (p.cleared) {      // 煙火
    for (let k = 0; k < 4; k++) {
      const fx = w * (0.3 + p.nums[k] * 0.6), fy = h * (0.12 + p.nums[k + 4] * 0.28), col = ['#FFD54F', '#FF8AD8', '#81D4FA', '#B2FF59'][k];
      g.strokeStyle = col; g.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = 5, r1 = 15 + p.nums[k + 8] * 10; g.beginPath(); g.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0); g.lineTo(fx + Math.cos(a) * r1, fy + Math.sin(a) * r1); g.stroke(); }
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(8, 8, w - 16, h - 16); g.setLineDash([]);
  label(g, p.title, 22, 26, 11, '#fff', 'left', w * 0.6);
  label(g, p.runName, 22, 46, 17, '#FFE082', 'left', w * 0.62);
  // 郵票
  g.fillStyle = '#FFF8E1'; g.fillRect(w - 78, 18, 56, 64); g.strokeStyle = '#B23A2E'; g.lineWidth = 2; g.strokeRect(w - 74, 22, 48, 56);
  drawFace(g, p.party[0], w - 50, 46, 40);
  label(g, p.date, w - 50, 72, 6.5, '#B23A2E', 'center', 46);
  g.save(); g.translate(w - 92, 74); g.rotate(-0.25);
  g.strokeStyle = p.cleared ? '#69F0AE' : '#FFAB91'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke();
  label(g, p.headline, 0, 0, 10, p.cleared ? '#69F0AE' : '#FFAB91', 'center', 40);
  g.restore();
  p.party.forEach((id, i) => drawFace(g, id, 52 + i * 62, 96, i === 0 ? 68 : 52));
  for (let i = 0; i < p.maxHearts; i++) heart(g, 30 + i * 17, 144, 6.5, i < p.hearts);
  // 走過的路
  let x = 22;
  const y = h - 34;
  STOPS.forEach((st, i) => {
    const id = st.filter((s) => p.visited.indexOf(s) >= 0)[0], mn = id ? matchNode(id) : undefined;
    g.fillStyle = id ? '#1d2140' : 'rgba(0,0,0,0.25)'; g.strokeStyle = id ? '#69F0AE' : 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x + 12, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mn) drawFace(g, mn.opp, x + 12, y, 20);
    else if (id) { g.fillStyle = '#FF8A65'; g.beginPath(); g.moveTo(x + 5, y + 5); g.lineTo(x + 12, y - 7); g.lineTo(x + 19, y + 5); g.closePath(); g.fill(); }
    if (i < STOPS.length - 1) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x + 26, y); g.lineTo(x + 40, y); g.stroke(); g.setLineDash([]); }
    x += 42;
  });
  p.lines.slice(0, 7).forEach((ln, i) => label(g, ln, w - 22, 100 + i * 16, 10.5, '#fff', 'right', w * 0.56));
}
