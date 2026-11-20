// MQTT.js（public/vendor/mqtt.min.js）的最小型別：只列出自架層用到的部分。
// 函式庫用 <script> 標籤在需要時才載入（見 ../room.ts），載入後掛在 window.mqtt。

export interface MqttConnectOptions {
  clientId: string;
  keepalive: number;
  reconnectPeriod: number;
  connectTimeout: number;
  clean: boolean;
  resubscribe: boolean;
}

/** 收到的訊息內容（瀏覽器版是 Uint8Array 的子類別，toString() 會解成 UTF-8 字串）。 */
export interface MqttPayload { toString(): string }

export interface MqttClient {
  on(event: 'connect' | 'close' | 'offline', cb: () => void): unknown;
  on(event: 'error', cb: (err: unknown) => void): unknown;
  on(event: 'message', cb: (topic: string, payload: MqttPayload) => void): unknown;
  publish(topic: string, message: string, opts: { qos: 0 }): unknown;
  subscribe(topics: string[], opts: { qos: 0 }): unknown;
  unsubscribe(topics: string[]): unknown;
}

export interface MqttLib {
  connect(url: string, opts: MqttConnectOptions): MqttClient;
}

declare global {
  interface Window {
    /** vendor/mqtt.min.js 載入後才有 */
    mqtt?: MqttLib;
  }
}
