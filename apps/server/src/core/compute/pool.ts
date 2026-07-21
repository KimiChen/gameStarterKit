/**
 * worker_threads 计算池——铁律 11 的卸载点（docs/SERVER.md 2026-07）。
 *
 * 适用：**请求触发**的 CPU 重计算（结算模拟等，玩家在等结果）。周期性/批量重活
 * ⛔ 不进这里——走独立进程先例（relayer / freeze-worker / season-rotation + singleton_lease）。
 *
 * 任务约定：core/compute/tasks/<任务>.ts 的 default 导出纯函数（任务名 = 文件名，
 * 与 websocket loader 同一「路径即名字」哲学）；输入/输出必须可 structuredClone 序列化
 * （不可序列化会被 start() 捕获并 reject，⛔ 不会崩进程）；任务内禁 IO。
 *
 * 生命周期（评审修复 2026-07-17）：
 *  - 'error' 与 'exit' 双监听——死 worker 立即出列（含 idle 中的尸体），在途任务立即 reject，
 *    ⛔ 不等 30s 假超时；
 *  - 重生带 1s 退避（持久性启动失败——如打包后 --import tsx 不可解析——不会演成每秒百次的
 *    重生风暴）；
 *  - 在途任务期间 worker ref() 保活（否则 unref 线程 + unref 定时器会让独立脚本在 await
 *    runInPool 时事件循环空转直接退出），空闲即 unref()。
 *
 * 超时语义：timer **入队即武装**（排队+执行全程一个窗口）。排队超时 = 从 queue 摘除
 * 并 reject（worker 持久性启动失败时调用方不能无限挂起、队列不能无界涨）；执行超时 =
 * 线程无法安全打断——超时 reject 后终止该 worker 并换新（弃车保帅），
 * 因此任务必须无副作用（终止不会留下半成品状态）。
 */
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { COMPUTE_POOL_SIZE, COMPUTE_TASK_TIMEOUT_MS } from "../infra/config";

interface Job {
  id: number;
  task: string;
  input: unknown;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}
interface WorkerReply { id: number; ok: boolean; result?: unknown; error?: string }

const WORKER_PATH = fileURLToPath(new URL("./worker-boot.mjs", import.meta.url));
const SIZE = Math.max(1, COMPUTE_POOL_SIZE);
const RESPAWN_DELAY_MS = 1_000;

let jobSeq = 0;
let destroyed = false;
const workers = new Set<Worker>();
const idle: Worker[] = [];
const queue: Job[] = [];
const running = new Map<Worker, Job>();

/** 死亡统一出口：出列（含 idle 尸体）、在途任务立即失败、退避重生。 */
function reap(w: Worker, cause: Error): void {
  if (!workers.has(w)) { return; } // 已处理过（error 与 exit 可能相继触发）
  workers.delete(w);
  const i = idle.indexOf(w);
  if (i >= 0) { idle.splice(i, 1); }
  const job = running.get(w);
  running.delete(w);
  if (job) {
    if (job.timer) { clearTimeout(job.timer); }
    job.reject(cause);
  }
  if (!destroyed && workers.size < SIZE) {
    // 退避重生：防持久性启动失败演成重生风暴（评审实测无退避时 ~146 次/秒）
    setTimeout(() => {
      if (!destroyed && workers.size < SIZE) { idle.push(spawn()); drain(); }
    }, RESPAWN_DELAY_MS).unref();
  }
}

function spawn(): Worker {
  // 入口是 worker-boot.mjs 引导壳（线程内程序化注册 tsx 后再载 worker.ts）：
  // Node 22 的 worker 里 execArgv 传 --import tsx 钩子不生效（见 worker-boot.mjs 注释）。
  // execArgv 显式清空：不继承父进程的 --test 等测试期 flag。
  const w = new Worker(WORKER_PATH, { execArgv: [] });
  w.unref(); // 空闲不阻止进程退出；接任务时 ref()（见 start）
  workers.add(w);
  w.on("message", (msg: WorkerReply) => {
    const job = running.get(w);
    running.delete(w);
    if (job && job.id === msg.id) {
      if (job.timer) { clearTimeout(job.timer); }
      if (msg.ok) { job.resolve(msg.result); } else { job.reject(new Error(msg.error ?? "compute 任务失败")); }
    }
    dispatch(w);
  });
  w.on("error", (e) => reap(w, e instanceof Error ? e : new Error(String(e))));
  // process.exit() 型死亡只发 'exit' 不发 'error'——不监听的话尸体滞留 idle，
  // 后续 postMessage 静默丢弃、任务假超时 30s（评审实测复现）
  w.on("exit", (code) => reap(w, new Error(`compute worker 退出（code=${code}）`)));
  return w;
}

function dispatch(w: Worker): void {
  if (destroyed || !workers.has(w)) { return; }
  const job = queue.shift();
  if (!job) { w.unref(); idle.push(w); return; }
  start(w, job);
}

function drain(): void {
  while (idle.length > 0 && queue.length > 0) {
    const w = idle.pop();
    if (!w) { break; }
    if (!workers.has(w)) { continue; } // 防御：尸体已由 reap 清理，此处兜底跳过
    const job = queue.shift();
    if (job) { start(w, job); }
  }
}

/**
 * 超时统一出口（timer 在 runInPool 入队时武装）：
 *  - 还在 queue：摘除并 reject（worker 持久性起不来时排队任务有失败出口）
 *  - 已在 running：超时弃车——terminate 该 worker（可能仍在死算）由 exit 监听收尸，并补位
 */
function onJobTimeout(job: Job): void {
  const qi = queue.indexOf(job);
  if (qi >= 0) {
    queue.splice(qi, 1);
    job.reject(new Error(`compute 任务排队超时（${COMPUTE_TASK_TIMEOUT_MS}ms 未分配到 worker）: ${job.task}`));
    return;
  }
  for (const [w, j] of running) {
    if (j !== job) { continue; }
    running.delete(w);
    workers.delete(w);
    const i = idle.indexOf(w);
    if (i >= 0) { idle.splice(i, 1); }
    void w.terminate();
    job.reject(new Error(`compute 任务超时（${COMPUTE_TASK_TIMEOUT_MS}ms）: ${job.task}`));
    if (!destroyed && workers.size < SIZE) { idle.push(spawn()); drain(); }
    return;
  }
  // 既不在 queue 也不在 running：已完成/已失败（timer 本应被清），防御性忽略
}

function start(w: Worker, job: Job): void {
  running.set(w, job);
  w.ref(); // 在途任务保活：独立脚本 await runInPool 时进程不得提前退出
  try {
    w.postMessage({ id: job.id, task: job.task, input: job.input });
  } catch (e) {
    // 输入不可 structuredClone（DataCloneError）等：任务失败但 worker 是健康的——
    // 归还继续用。⛔ 不能让异常冒进 'message' 回调（那会成为 uncaught exception 崩网关）
    if (job.timer) { clearTimeout(job.timer); }
    running.delete(w);
    job.reject(e instanceof Error ? e : new Error(String(e)));
    dispatch(w);
    return;
  }
}

/** 提交计算任务（task = core/compute/tasks/ 下的文件名，不含扩展名）。 */
export function runInPool<TIn, TOut>(task: string, input: TIn): Promise<TOut> {
  if (destroyed) { return Promise.reject(new Error("compute 池已销毁")); }
  return new Promise<TOut>((resolve, reject) => {
    const job: Job = {
      id: ++jobSeq, task, input,
      resolve: resolve as (v: unknown) => void, reject, timer: null,
    };
    // 超时从入队算起（排队+执行全程一个窗口）：worker 持久性起不来时排队任务也有失败出口
    job.timer = setTimeout(() => onJobTimeout(job), COMPUTE_TASK_TIMEOUT_MS);
    job.timer.unref();
    // 惰性建池：首个任务才起线程（测试/无计算负载的进程零开销）
    while (workers.size < SIZE) { idle.push(spawn()); }
    queue.push(job);
    drain();
  });
}

/** 销毁池（测试收尾用；生产随进程退出）。 */
export async function destroyPool(): Promise<void> {
  destroyed = true;
  const all = [...workers];
  workers.clear();
  idle.length = 0;
  for (const job of queue.splice(0)) {
    if (job.timer) { clearTimeout(job.timer); }
    job.reject(new Error("compute 池已销毁"));
  }
  for (const [, job] of running) {
    if (job.timer) { clearTimeout(job.timer); }
    job.reject(new Error("compute 池已销毁"));
  }
  running.clear();
  await Promise.all(all.map((w) => w.terminate()));
  destroyed = false; // 允许测试后重建
}
