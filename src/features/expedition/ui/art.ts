/**
 * 遠征面板上用程式畫的圖：路線地圖（天色跟著進度從清晨走到夜晚）、收服演出、通關明信片。
 * 角色圖一律用遊戲既有的素材（選角面板的頭像），這裡只畫幾何圖形。純顯示，不碰存檔和規則。
 */
import { svc } from '../../../core/services';
import { heart, label, star4 } from '../../campaign/draw';
import { FORK_OF, STOPS as STOPS1, matchNode, nodeById, type MatchNode } from '../content';
import { rngFor } from '../rng';

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
  /** 這一章的站（不給就是第一章） */
  stops?: readonly (readonly string[])[];
  /** 第幾章（0 起算）：第二章從黃昏開始，天色越走越暗 */
  chapter?: number;
  /** 這一輪實際的比賽節點（岔路空位要用種子決定的對手） */
  resolve?: (id: string) => MatchNode | undefined;
  ended: boolean;
  names: Record<string, string>;
  /** 窄螢幕：只標目前這一站（岔路時標兩個選項）的名字，字放大 */
  compact?: boolean;
  /** 還不能看的站：畫成問號、不畫頭像 */
  veiled?: readonly string[];
}

function stopIndex(id: string): number {
  if (FORK_OF[id] !== undefined) return FORK_OF[id];
  for (let i = 0; i < STOPS.length; i++) if (STOPS[i].indexOf(id) >= 0) return i;
  return 0;
}
const X0 = 0.06;
/** 目前畫的是哪一章的站（drawMap／drawPostcard 一開頭設定） */
let STOPS: readonly (readonly string[])[] = STOPS1, DX = (1 - 2 * X0) / (STOPS1.length - 1);
function useStops(s: readonly (readonly string[])[] | undefined): void { STOPS = s || STOPS1; DX = (1 - 2 * X0) / (STOPS.length - 1); }
function pos(id: string, w: number, h: number): [number, number] {
  const i = stopIndex(id), x = w * (X0 + DX * i), st = STOPS[i];
  // 岔路分出去的幾條：上下平均排開（兩條在 0.33／0.78，三條再加中間）
  if (st.length > 1 && FORK_OF[id] === undefined) return [x, h * (0.33 + 0.45 * st.indexOf(id) / (st.length - 1))];
  // 一般站：微微上下起伏，比較像山路
  return [x, h * (0.56 + (i % 2 ? -0.04 : 0.04))];
}

export function drawMap(g: G, w: number, h: number, t: number, m: MapModel): void {
  useStops(m.stops);
  const here = stopIndex(m.nodeId), atFork = FORK_OF[m.nodeId] !== undefined, last = STOPS.length - 1;
  // 第一章從清晨走到夜晚，第二章從午後走到夜晚，第三章（洞窟）一直是夜晚
  const stageNow = m.chapter && m.chapter >= 2 ? 4 : m.chapter ? 2 + Math.floor(here * 2 / last) : Math.floor(here * 4 / last);
  sky(g, w, h, m.ended ? 4 : stageNow, m.nums, t);
  const seen = (id: string): boolean => m.visited.indexOf(id) >= 0;
  // 岔路已經選了哪一條：沒選的那條變淡
  const picked = (st: readonly string[]): string | undefined => st.filter((id) => seen(id) || m.nodeId === id)[0];
  const dim = (id: string): boolean => { const st = STOPS[stopIndex(id)]; const p = st.length > 1 ? picked(st) : undefined; return !!p && p !== id; };
  // 路
  const seg = (a: string, b: string): void => {
    const [ax, ay] = pos(a, w, h), [bx, by] = pos(b, w, h), done = seen(a) && (seen(b) || m.nodeId === b);
    g.save();
    g.globalAlpha = dim(a) || dim(b) ? 0.18 : 1;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 5; g.setLineDash([]);
    g.beginPath(); g.moveTo(ax, ay + 2); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 6 + 2, bx, by + 2); g.stroke();
    g.strokeStyle = done ? '#FFE9A8' : 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
    if (!done) { g.setLineDash([2, 6]); g.lineDashOffset = -t / 6; }
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 6, bx, by); g.stroke();
    g.restore();
  };
  for (let i = 0; i + 1 < STOPS.length; i++) STOPS[i].forEach((a) => STOPS[i + 1].forEach((b) => seg(a, b)));
  // 站
  STOPS.forEach((st, si) => st.forEach((id) => {
    const [x, y] = pos(id, w, h), n = nodeById(id), veil = !!m.veiled && m.veiled.indexOf(id) >= 0;
    const mn = veil ? undefined : m.resolve ? m.resolve(id) : matchNode(id);
    const done = seen(id), cur = !m.ended && (m.nodeId === id || (atFork && FORK_OF[m.nodeId] === si));
    const big = !!(mn && mn.boss), r = big ? 15 : 12;
    g.save();
    g.globalAlpha = dim(id) ? 0.3 : 1;
    if (cur) { g.globalAlpha *= 0.5 + 0.3 * Math.sin(t / 9); g.fillStyle = '#FFD54F'; g.beginPath(); g.arc(x, y, r + 5 + Math.sin(t / 9) * 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = dim(id) ? 0.3 : 1; }
    if (big) {         // 首領：轉動的尖刺外框
      g.fillStyle = '#B23A2E'; g.beginPath();
      for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10 + t / 90, rr = k % 2 ? r + 1 : r + 6; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    g.fillStyle = '#1d2140'; g.strokeStyle = done ? '#69F0AE' : cur ? '#FFD54F' : '#fff'; g.lineWidth = 2.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (veil) label(g, '?', x, y + 0.5, 14, '#CE93D8');
    else if (mn) drawFace(g, mn.opp, x, y, r * 1.7);
    else if (n && n.kind === 'supply') {   // 帳篷和營火
      g.fillStyle = '#FF8A65'; g.beginPath(); g.moveTo(x - 7, y + 5); g.lineTo(x - 1, y - 7); g.lineTo(x + 5, y + 5); g.closePath(); g.fill();
      g.fillStyle = '#4E2A1E'; g.beginPath(); g.moveTo(x - 3, y + 5); g.lineTo(x - 1, y - 1); g.lineTo(x + 1, y + 5); g.closePath(); g.fill();
      g.fillStyle = t % 12 < 6 ? '#FFD54F' : '#FF9800'; g.beginPath(); g.arc(x + 7, y + 3 - (t % 12 < 6 ? 1 : 0), 2, 0, Math.PI * 2); g.fill();
    } else if (n && n.kind === 'event') {  // 奇遇：問號
      label(g, '?', x, y + 0.5, 14, '#FFE082');
    }
    if (done) { g.fillStyle = '#69F0AE'; g.strokeStyle = '#000'; g.lineWidth = 1.3; g.beginPath(); g.arc(x + r - 2, y - r + 2, 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); label(g, '✓', x + r - 2, y - r + 2.5, 6.5, '#0B3D1E'); }
    if (!m.compact) label(g, m.names[id] || id, x, y + r + 8, 7.5, cur ? '#FFE082' : '#fff', 'center', w * DX * 0.98);
    else if (cur) label(g, m.names[id] || id, Math.max(40, Math.min(w - 40, x)), y + r + 10, 11, '#FFE082', 'center', 90);
    g.restore();
  }));
  // 夥伴站在目前的位置（岔路：站在路口）
  if (!m.ended) {
    let [px, py] = pos(m.nodeId, w, h);
    if (atFork) { const prev = STOPS[stopIndex(m.nodeId) - 1][0], a = pos(prev, w, h); px = a[0] + w * DX * 0.5; py = a[1] - 4; }
    else { px -= 16; py -= 12; }
    const hop = Math.abs(Math.sin(t / 10)) * 4;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px, py + 12, 8 - hop * 0.6, 2.2, 0, 0, Math.PI * 2); g.fill();
    drawFace(g, m.lead, px, py - hop, 24);
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

// ---------- 覺醒演出 ----------
export interface AwakenScene {
  char: string;
  /** 光環的顏色 */
  color: string;
  title: string;
  sub: string;
  note: string;
}
/** f：從開始算起的幀數。光柱升起、光環往上飄、一陣閃光之後出現★和文字。回傳演完了沒。 */
export function drawAwaken(g: G, w: number, h: number, f: number, t: number, nums: readonly number[], a: AwakenScene): boolean {
  sky(g, w, h, 4, nums, t);
  const cx = w / 2, cy = h * 0.58, k = Math.min(1, f / 24), END = 64;
  g.save();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, a.color);
  g.globalAlpha = (0.28 + 0.12 * Math.sin(t / 6)) * k; g.fillStyle = gr; g.fillRect(cx - 34 * k, 0, 68 * k, h);
  g.lineWidth = 2; g.strokeStyle = a.color;
  for (let i = 0; i < 4; i++) {
    const u = ((f + i * 9) % 36) / 36;
    g.globalAlpha = (1 - u) * k; g.beginPath(); g.ellipse(cx, cy + 30 - u * 74, 36 - u * 10, 9 - u * 2.5, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(cx, cy + 32, 28, 6, 0, 0, Math.PI * 2); g.fill();
  const rise = Math.sin(Math.min(1, f / 20) * Math.PI / 2) * 8;
  drawFace(g, a.char, cx, cy - rise, 62);
  if (f > 18 && f < 36) {      // 閃光
    g.save(); g.globalAlpha = Math.abs(Math.sin((f - 18) / 18 * Math.PI)) * 0.85; g.fillStyle = '#fff';
    g.beginPath(); g.arc(cx, cy - rise, 34 + (f - 18), 0, Math.PI * 2); g.fill(); g.restore();
  }
  if (f >= 30) {
    const s = Math.min(1, (f - 30) / 10);
    for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4 + t / 40; star4(g, cx + Math.cos(ang) * (44 + s * 6), cy - rise + Math.sin(ang) * (26 + s * 4), 4 + 2 * s, i % 2 ? a.color : '#fff'); }
    label(g, a.title, cx, h * 0.12, 16, a.color, 'center', w - 20);
    label(g, a.sub, cx, h * 0.12 + 19, 10.5, '#fff', 'center', w - 20);
    label(g, a.note, cx, h - 12, 9, '#E8EAF6', 'center', w - 20);
  }
  return f > END + 30;
}

// ---------- 明信片 ----------
export interface Postcard {
  title: string; runName: string; headline: string; cleared: boolean;
  party: readonly string[]; visited: readonly string[]; names: Record<string, string>;
  hearts: number; maxHearts: number; lines: readonly string[]; date: string; nums: readonly number[];
  stops?: readonly (readonly string[])[];
  resolve?: (id: string) => MatchNode | undefined;
  /** 這一輪覺醒過的夥伴（頭像旁加★） */
  awakened?: readonly string[];
}
export function drawPostcard(g: G, w: number, h: number, p: Postcard): void {
  useStops(p.stops);
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
  p.party.forEach((id, i) => {
    drawFace(g, id, 52 + i * 62, 96, i === 0 ? 68 : 52);
    if (p.awakened && p.awakened.indexOf(id) >= 0) star4(g, 52 + i * 62 + (i === 0 ? 26 : 20), 72, 6, '#FFD54F');
  });
  for (let i = 0; i < p.maxHearts; i++) heart(g, 30 + i * 17, 144, 6.5, i < p.hearts);
  // 走過的路
  let x = 20;
  const y = h - 30, step = (w - 40) / STOPS.length;
  STOPS.forEach((st, i) => {
    const id = st.filter((s) => p.visited.indexOf(s) >= 0)[0], mn = id ? (p.resolve ? p.resolve(id) : matchNode(id)) : undefined;
    g.fillStyle = id ? '#1d2140' : 'rgba(0,0,0,0.25)'; g.strokeStyle = id ? '#69F0AE' : 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x + 12, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mn) drawFace(g, mn.opp, x + 12, y, 20);
    else if (id && nodeById(id)?.kind === 'event') label(g, '?', x + 12, y, 11, '#FFE082');
    else if (id && nodeById(id)?.kind === 'supply') { g.fillStyle = '#FF8A65'; g.beginPath(); g.moveTo(x + 5, y + 5); g.lineTo(x + 12, y - 7); g.lineTo(x + 19, y + 5); g.closePath(); g.fill(); }
    if (i < STOPS.length - 1) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x + 26, y); g.lineTo(x + step, y); g.stroke(); g.setLineDash([]); }
    x += step;
  });
  p.lines.slice(0, 7).forEach((ln, i) => label(g, ln, w - 22, 100 + i * 16, 10.5, '#fff', 'right', w * 0.56));
}
