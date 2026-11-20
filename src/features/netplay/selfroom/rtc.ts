// ---------- 直連（WebRTC） ----------
// 資料通道用不可靠模式：掉包不重傳，下一包直接蓋過去，不會卡。
// 配對（交換 SDP／ICE 候選）走中繼層的訊號 topic；id 比較小的那一方負責發起。
import { anyBroker, pubAll } from './relay';
import type { PeerState, SelfCtx, SelfRoom, SignalMsg } from './types';

function now(): number { return performance.now(); }

/** 送訊號給某個 peer。 */
function sig(ctx: SelfCtx, R: SelfRoom, to: string, d: unknown): void { pubAll(ctx, R.ts + to, { from: ctx.me, i: ++R.sigN, d }); }

export function closeRtc(p: PeerState): void {
  p.dcOpen = false;
  try { if (p.dc) p.dc.close(); } catch (e) { /* 已經關了 */ }
  try { if (p.pc) p.pc.close(); } catch (e) { /* 已經關了 */ }
  p.dc = null; p.pc = null;
}

function wireDc(ctx: SelfCtx, R: SelfRoom, p: PeerState, dc: RTCDataChannel, pc: RTCPeerConnection): void {
  p.dc = dc;
  dc.onopen = () => { if (p.pc === pc) { p.dcOpen = true; p.dcSeen = now(); p.tries = 0; R.flush(true); R.connChanged(); } };
  dc.onclose = () => { if (p.pc === pc) { p.dcOpen = false; scheduleRetry(ctx, p); R.connChanged(); } };
  dc.onmessage = (e: MessageEvent) => {
    let m: unknown; try { m = JSON.parse(e.data as string); } catch (err) { return; }
    if (m && typeof m === 'object') R.onPresence(p.id, m as Record<string, unknown>, 'dc');   // 上面確認過是物件
  };
}

function newPc(ctx: SelfCtx, R: SelfRoom, p: PeerState): RTCPeerConnection {
  closeRtc(p);
  const pc = new RTCPeerConnection({ iceServers: ctx.ice });
  p.pc = pc; p.pendC = [];
  pc.onicecandidate = (e) => { if (e.candidate && p.pc === pc) sig(ctx, R, p.id, { c: e.candidate }); };
  pc.onconnectionstatechange = () => {
    if (p.pc !== pc) return;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { closeRtc(p); scheduleRetry(ctx, p); R.connChanged(); }
  };
  pc.ondatachannel = (e) => { if (p.pc === pc) wireDc(ctx, R, p, e.channel, pc); };
  return pc;
}

export function connectRtc(ctx: SelfCtx, R: SelfRoom, p: PeerState): void {
  if (ctx.noRtc || R.dead || !anyBroker(ctx)) { scheduleRetry(ctx, p); return; }
  const pc = newPc(ctx, R, p);
  wireDc(ctx, R, p, pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }), pc);
  pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => {
    if (p.pc === pc) sig(ctx, R, p.id, { sdp: pc.localDescription });
  }).catch(() => { scheduleRetry(ctx, p); });
  // 12 秒內沒打通就放棄這一次，稍後再試（期間資料走中繼）
  window.setTimeout(() => { if (p.pc === pc && !p.dcOpen) { closeRtc(p); scheduleRetry(ctx, p); } }, 12000);
}

export function scheduleRetry(ctx: SelfCtx, p: PeerState): void {
  if (ctx.noRtc || !(ctx.me < p.id) || p.retryAt) return;
  p.tries++;
  p.retryAt = now() + Math.min(20000, 1000 * Math.pow(2, Math.min(p.tries, 5))) * (0.75 + Math.random() * 0.5);
}

function drainCandidates(p: PeerState, pc: RTCPeerConnection): void {
  if (p.pc !== pc) return;
  const q = p.pendC; p.pendC = [];
  q.forEach((c) => { pc.addIceCandidate(c).catch(() => { /* 過期的候選 */ }); });
}

/** 收到寄給自己的訊號。 */
export function onSignal(ctx: SelfCtx, R: SelfRoom, msg: SignalMsg): void {
  if (ctx.noRtc || R.dead || !msg.d || typeof msg.from !== 'string') return;
  const p = R.getPeer(msg.from), d = msg.d;
  p.seen = now();
  // 同一則訊號每個中繼都會送來一份，只處理第一份。
  // 不這樣做的話，重複的 offer 會把剛建好的連線拆掉重建，兩邊對不上，直連永遠打不通。
  if (typeof msg.i === 'number') {
    if (p.sigSeen[msg.i]) return;
    p.sigSeen[msg.i] = 1;
  }
  try {
    if (d.sdp && d.sdp.type === 'offer') {
      const pc = newPc(ctx, R, p);
      pc.setRemoteDescription(d.sdp).then(() => { drainCandidates(p, pc); return pc.createAnswer(); })
        .then((a) => pc.setLocalDescription(a))
        .then(() => { if (p.pc === pc) sig(ctx, R, p.id, { sdp: pc.localDescription }); }).catch(() => { /* 配對失敗：等對方重試 */ });
    } else if (d.sdp && d.sdp.type === 'answer' && p.pc) {
      const pc2 = p.pc;
      pc2.setRemoteDescription(d.sdp).then(() => { drainCandidates(p, pc2); }).catch(() => { /* 同上 */ });
    } else if (d.c && p.pc) {
      // 對方的描述還沒套用完就先到的候選位址：先存著，免得被丟掉
      if (p.pc.remoteDescription) p.pc.addIceCandidate(d.c).catch(() => { /* 過期的候選 */ });
      else p.pendC.push(d.c);
    }
  } catch (e) { /* 壞掉的訊號 */ }
}
