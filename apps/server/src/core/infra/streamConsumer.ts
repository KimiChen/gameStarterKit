/**
 * 通用消息流消费者工厂（DUAL_MODE §4.5）——抽自 `push.ts` 邮件唤醒循环，复用给控制总线（§2.3）。
 *
 * 语义（每处复用都一致）：**每节点独立游标 `XREAD "$"`，⛔ 不用 consumer group**——每个节点都要
 * 看到流的全部条目（唤醒的目标 / 被踢的连接都可能在任何节点）。自愈：单条 onEntry 抛错不杀链路、
 * Redis 抖动退避重试；`XTRIM MINID` 兜底裁剪（⛔ 禁 MAXLEN，09·K6）。阻塞 XREAD 独享 `duplicate()` 连接。
 */
import type Redis from "ioredis";

export interface StreamConsumerOpts {
  /** XREAD BLOCK 毫秒（默认 2000）。 */
  blockMs?: number;
  /** XREAD COUNT（默认 100）。 */
  count?: number;
  /** MINID 兜底裁剪窗毫秒（默认 24h）；0 = 不裁（裁剪 owner 在别处时）。 */
  trimMs?: number;
  /** 裁剪节律毫秒（默认 1h）。 */
  trimEveryMs?: number;
}

export interface StreamConsumer { stop(): void }

/** 平铺 fields 数组（XADD `*` k v k v…）取某字段值。 */
export function fieldOf(fields: string[], key: string): string | undefined {
  const i = fields.indexOf(key);
  return i >= 0 ? fields[i + 1] : undefined;
}

/**
 * 起一个消费循环（幂等由调用方单例护栏保证）。返回 `stop()` 句柄（置停止旗，循环下轮退出并断连）。
 * @param client 流所在 Redis 的 getter（mailwake=durable、控制总线=coord）——每次取以容 ioredis 重连。
 */
export function startStreamConsumer(
  name: string,
  client: () => Redis,
  streamKey: string,
  onEntry: (fields: string[], id: string) => void,
  opts: StreamConsumerOpts = {},
): StreamConsumer {
  const blockMs = opts.blockMs ?? 2000;
  const count = opts.count ?? 100;
  const trimMs = opts.trimMs ?? 24 * 3600 * 1000;
  const trimEveryMs = opts.trimEveryMs ?? 3600 * 1000;
  let stopFlag = false;

  void (async () => {
    const sub = client().duplicate(); // 阻塞 XREAD 需独享连接（阻塞期不能复用发命令）
    let cursor = "$"; // 只看启动后的新条目（历史无价值：mail 上线自拉、踢人是即时动作）
    let lastTrim = Date.now();
    try {
      while (!stopFlag) {
        try {
          const res = await sub.xread("COUNT", count, "BLOCK", blockMs, "STREAMS", streamKey, cursor) as
            [string, [string, string[]][]][] | null;
          if (res) {
            for (const [, entries] of res) {
              for (const [id, fields] of entries) {
                cursor = id;
                try { onEntry(fields, id); } catch (e) { console.error(`[${name}] onEntry 异常 id=${id}`, e); }
              }
            }
          }
          if (trimMs > 0 && Date.now() - lastTrim > trimEveryMs) {
            lastTrim = Date.now();
            await client().xtrim(streamKey, "MINID", "~", String(Date.now() - trimMs)).catch(() => {});
          }
        } catch (e) {
          if (stopFlag) { break; }
          console.error(`[${name}] 消费循环异常，1s 后重试`, e);
          await new Promise((r) => setTimeout(r, 1000)); // ioredis 自动重连，这里只退避
        }
      }
    } finally {
      sub.disconnect();
    }
  })();

  return { stop() { stopFlag = true; } };
}
