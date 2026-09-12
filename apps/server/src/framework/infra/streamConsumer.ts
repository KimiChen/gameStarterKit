/**
 * 通用消息流消费者工厂（DUAL_MODE §4.5）——抽自 `push.ts` 邮件唤醒循环，复用给控制总线（§2.3）。
 *
 * 语义（每处复用都一致）：**每节点独立游标 `XREAD "$"`，⛔ 不用 consumer group**——每个节点都要
 * 看到流的全部条目（唤醒的目标 / 被踢的连接都可能在任何节点）。自愈：单条 onEntry 抛错不杀链路、
 * Redis 抖动退避重试；`XTRIM MINID` 兜底裁剪（⛔ 禁 MAXLEN，09·K6）。阻塞 XREAD 独享 `duplicate()` 连接。
 */
import type Redis from "ioredis";
import { assertAdmissionOpen, defaultLifecycle } from "./lifecycle";

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

export interface StreamConsumer { stop(): Promise<void> }

// A stopping consumer remains registered until its blocking XREAD has actually
// unwound.  Use an instance suffix so a restart can register concurrently with
// that final unwind; otherwise LifecycleRegistry's name de-duplication would
// silently drop the new consumer's cleanup handle.
let consumerRegistrationSeq = 0;

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
  // ⚠ 允许返回 Promise 并**逐条 await**：消费侧可能要回读 Redis 做栅栏判定（如 kick 的陈旧事件丢弃）。
  // ⛔ 不能改成"发射后不管"：那样 try/catch 兜不住 rejection，且同一 uid 的事件会乱序处理。
  onEntry: (fields: string[], id: string) => void | Promise<void>,
  opts: StreamConsumerOpts = {},
): StreamConsumer {
  assertAdmissionOpen();
  // A test/embedded process may intentionally restart after a completed
  // registry disposal. Production shutdown never reopens admission, but this
  // explicit start boundary is the one place where reopening is meaningful.
  if (defaultLifecycle.isClosed) { defaultLifecycle.reset(); }
  const blockMs = opts.blockMs ?? 2000;
  const count = opts.count ?? 100;
  const trimMs = opts.trimMs ?? 24 * 3600 * 1000;
  const trimEveryMs = opts.trimEveryMs ?? 3600 * 1000;
  let stopFlag = false;
  let wakeStop: (() => void) | null = null;
  let wakeRead: (() => void) | null = null;
  let sub: Redis | null = null;
  let disconnectError: unknown = null;

  // ioredis' disconnect is normally idempotent, but adapters and test doubles
  // may throw synchronously.  Capture that failure so stop() can report it
  // without losing the ownership/unregister cleanup path.
  const disconnectSub = (): void => {
    if (!sub) { return; }
    try {
      sub.disconnect();
    } catch (error) {
      disconnectError ??= error;
    }
  };

  const loopDone = (async () => {
    let cursor = "$"; // 只看启动后的新条目（历史无价值：mail 上线自拉、踢人是即时动作）
    let lastTrim = Date.now();
    try {
      while (!stopFlag) {
        try {
          // Connection creation belongs to the retry boundary too. `ioredis`
          // `duplicate()` can throw synchronously while a client is being
          // replaced, and that must not reject the long-lived loop before its
          // stop handle has a chance to observe it.
          if (sub === null) {
            sub = client().duplicate(); // 阻塞 XREAD 需独享连接（阻塞期不能复用发命令）
          }
          const readClient = sub;
          type ReadResult = [string, [string, string[]][]][] | null;
          // A disconnect should wake a blocked read even when the adapter's
          // disconnect method fails.  Promise.race observes the underlying
          // read rejection as well, so a late failure cannot become unhandled.
          const interrupt = new Promise<ReadResult>((resolve) => {
            wakeRead = () => resolve(null);
          });
          const read = readClient.xread("COUNT", count, "BLOCK", blockMs, "STREAMS", streamKey, cursor) as
            Promise<ReadResult>;
          const res = await Promise.race<ReadResult>([read, interrupt]);
          wakeRead = null;
          if (res) {
            for (const [, entries] of res) {
              for (const [id, fields] of entries) {
                cursor = id;
                try { await onEntry(fields, id); } catch (e) { console.error(`[${name}] onEntry 异常 id=${id}`, e); }
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
          // 退避也可被 stop 立即唤醒；否则停服要额外等待整个 1s。
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              wakeStop = null;
              resolve();
            }, 1000);
            wakeStop = () => {
              clearTimeout(timer);
              wakeStop = null;
              resolve();
            };
          }); // ioredis 自动重连，这里只退避
        }
      }
    } finally {
      disconnectSub();
      sub = null;
      wakeRead = null;
    }
  })();

  // Attach an observer immediately: a failure outside the retry boundary
  // (for example, an unexpected disconnect error in `finally`) must never
  // become an unhandled rejection in the process-wide consumer.
  void loopDone.catch((error) => {
    console.error(`[${name}] 消费循环终止`, error);
  });

  let stopPromise: Promise<void> | null = null;
  let unregister = (): void => {};
  const stop = (): Promise<void> => {
    if (stopPromise) { return stopPromise; }
    stopFlag = true;
    wakeStop?.();
    wakeRead?.();
    wakeRead = null;
    // disconnect 打断阻塞中的 XREAD；finally 会再次 disconnect，操作本身幂等。
    disconnectSub();
    // Establish ownership of the stop promise before awaiting anything or
    // invoking user/adaptor code.  A synchronous disconnect failure must not
    // make a second stop start another cleanup attempt.
    stopPromise = (async () => {
      const errors: unknown[] = [];
      try {
        await loopDone;
      } catch (error) {
        errors.push(error);
      }
      try {
        unregister();
      } catch (error) {
        errors.push(error);
      }
      if (disconnectError !== null) errors.unshift(disconnectError);
      if (errors.length > 0) {
        throw new AggregateError(errors, `[${name}] 停止消费循环失败`);
      }
    })();
    return stopPromise;
  };
  const handle: StreamConsumer = { stop };
  const registrationName = `stream:${name}:${++consumerRegistrationSeq}`;
  unregister = defaultLifecycle.register(registrationName, stop);
  return handle;
}
