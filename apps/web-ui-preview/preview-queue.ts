export interface PreviewJob {
    priority: number;
    run(): Promise<void>;
    dispose(): void;
}

/** Cancellation removes queued work immediately; running work keeps its slot until settled. */
export class PreviewQueue<Key> {
    private readonly pending = new Map<Key, PreviewJob>();
    private readonly jobs = new Map<Key, PreviewJob>();
    private running = 0;
    private scheduled = false;

    constructor(private readonly concurrency = 3) {}

    show(key: Key, job: PreviewJob): void {
        this.hide(key);
        this.jobs.set(key, job);
        this.pending.set(key, job);
        this.schedule();
    }

    prioritize(key: Key, priority: number): void {
        const job = this.jobs.get(key);
        if (job) job.priority = priority;
        this.schedule();
    }

    hide(key: Key): void {
        this.pending.delete(key);
        this.jobs.get(key)?.dispose();
        this.jobs.delete(key);
    }

    dispose(): void {
        for (const key of this.jobs.keys()) this.hide(key);
    }

    private schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => { this.scheduled = false; this.pump(); });
    }

    private pump(): void {
        while (this.running < this.concurrency && this.pending.size) {
            const [key, job] = [...this.pending].sort((a, b) => a[1].priority - b[1].priority)[0]!;
            this.pending.delete(key);
            this.running += 1;
            void Promise.resolve().then(() => {
                if (this.jobs.get(key) === job) return job.run();
                return undefined;
            }).catch((error) => console.error("[UniFlex Web] 卡片预览失败：", error)).finally(() => {
                this.running -= 1;
                this.schedule();
            });
        }
    }
}
