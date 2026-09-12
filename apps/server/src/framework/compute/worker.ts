/**
 * 计算池 worker 入口（worker_threads 线程内运行；由 pool.ts 以 --import tsx 启动）。
 * 任务名 = tasks/ 下文件名（路径即名字，启动侧已建池才会有消息进来）。
 */
import { parentPort } from "node:worker_threads";

interface JobMsg { id: number; task: string; input: unknown }

const TASK_NAME = /^[a-zA-Z0-9_-]+$/;

parentPort!.on("message", (msg: JobMsg) => {
  void (async () => {
    try {
      if (!TASK_NAME.test(msg.task)) { throw new Error(`非法任务名: ${msg.task}`); }
      const mod = await import(new URL(`./tasks/${msg.task}.ts`, import.meta.url).href) as
        { default?: (input: unknown) => unknown };
      if (typeof mod.default !== "function") {
        throw new Error(`tasks/${msg.task}.ts 缺少 default 导出函数`);
      }
      const result = await mod.default(msg.input);
      parentPort!.postMessage({ id: msg.id, ok: true, result });
    } catch (e) {
      parentPort!.postMessage({ id: msg.id, ok: false, error: (e as Error)?.message ?? String(e) });
    }
  })();
});
