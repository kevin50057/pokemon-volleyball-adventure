// ------------------------------------------------------------
// 中繼層：多個 MQTT 伺服器同時連線
// ------------------------------------------------------------
// topic：PREFIX / 房名 / p|s / id
//   p = presence（每個人一個 topic，大家都訂閱 PREFIX/房名/p/+）
//   s = 訊號（WebRTC 配對資訊，只訂閱寄給自己的 PREFIX/房名/s/<me>）
import type { BrokerClient, SelfCtx, SignalMsg } from './types';

/** topic 的第一段。⚠ 跟經典版互連，不能改。 */
export const PREFIX = 'pvu9x7';

export function anyBroker(ctx: SelfCtx): boolean { return ctx.clients.some((c) => c.up); }

export function notifyConn(ctx: SelfCtx): void {
  ctx.lobbyFns.forEach((f) => { try { f(ctx.lobbyConnected()); } catch (e) { /* 呼叫端的錯誤不影響其他人 */ } });
  Object.keys(ctx.rooms).forEach((n) => { ctx.rooms[n].connChanged(); });
}

export function startBrokers(ctx: SelfCtx): void {
  if (ctx.started) return;
  ctx.started = true;
  const mqtt = window.mqtt;
  ctx.brokers.forEach((url, i) => {
    const c: BrokerClient = { url, up: false, cl: null, idx: i };
    ctx.clients.push(c);
    try {
      // window.mqtt 在建立 lobby 前就確認過存在（見 index.ts）；萬一不在，這裡丟例外，跟舊版一樣略過這個伺服器
      c.cl = mqtt!.connect(url, {
        clientId: 'pv_' + ctx.me + '_' + i, keepalive: 15, reconnectPeriod: 1500 + i * 400, connectTimeout: 8000,
        clean: true, resubscribe: true,
      });
    } catch (e) { return; }
    const cl = c.cl;
    cl.on('connect', () => {
      c.up = true;
      Object.keys(ctx.rooms).forEach((n) => { ctx.rooms[n].subscribe(c); ctx.rooms[n].flush(true); });
      notifyConn(ctx);
    });
    const down = (): void => { if (c.up) { c.up = false; notifyConn(ctx); } };
    cl.on('close', down); cl.on('offline', down);
    cl.on('error', () => { /* 錯誤會接著觸發 close／offline */ });
    cl.on('message', (topic, payload) => {
      const parts = topic.split('/');   // PREFIX / room / p|s / id
      if (parts[0] !== PREFIX) return;
      const R = ctx.rooms[parts[1]];
      if (!R) return;
      let msg: unknown;
      try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      const m = msg as Record<string, unknown>;   // 上一行確認過是物件
      if (parts[2] === 'p' && parts[3] !== ctx.me) R.onPresence(parts[3], m, 'relay');
      else if (parts[2] === 's' && parts[3] === ctx.me) R.onSignal(m as SignalMsg);   // 訊號內容不保證形狀，onSignal 裡逐一檢查並包在 try/catch
    });
  });
}

// 每個中繼都送：兩邊連得上的中繼不一定相同，只送一個的話對方可能完全收不到
export function pubRaw(ctx: SelfCtx, topic: string, s: string): void {
  ctx.clients.forEach((c) => { if (c.up) { try { c.cl!.publish(topic, s, { qos: 0 }); } catch (e) { /* 這個伺服器送不出去就算了 */ } } });
}
export function pubAll(ctx: SelfCtx, topic: string, obj: unknown): void { pubRaw(ctx, topic, JSON.stringify(obj)); }
