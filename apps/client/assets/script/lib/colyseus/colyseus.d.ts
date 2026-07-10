/**
 * @colyseus/sdk 0.17.43 UMD 包（colyseus.js，以"导入为插件"方式加载）的全局类型声明。
 *
 * 手写精简版：只覆盖本项目用到的 API 子集，与 UMD 实际导出对齐
 * （exports: Client / Room / Callbacks / getStateCallbacks / CloseCode / Protocol / ...）。
 * 完整类型见 npm 包 @colyseus/sdk 的 build/*.d.ts。
 */
declare namespace Colyseus {
    /** 事件信号：调用即注册监听，返回取消函数 */
    interface EventSignal<CB extends (...args: any[]) => void> {
        (callback: CB): () => void;
        once(callback: CB): void;
        remove(callback: CB): void;
        invoke(...args: Parameters<CB>): void;
        clear(): void;
    }

    class Client {
        /** endpoint 传 http(s) 地址（如 http://localhost:2568），SDK 自动派生 ws(s) */
        constructor(endpoint: string);
        joinOrCreate<TState = any>(roomName: string, options?: any): Promise<Room<TState>>;
        create<TState = any>(roomName: string, options?: any): Promise<Room<TState>>;
        join<TState = any>(roomName: string, options?: any): Promise<Room<TState>>;
        joinById<TState = any>(roomId: string, options?: any): Promise<Room<TState>>;
        /** 手动重连：返回全新 Room 实例，所有监听需重新注册 */
        reconnect<TState = any>(reconnectionToken: string): Promise<Room<TState>>;
    }

    class Room<TState = any> {
        readonly sessionId: string;
        readonly roomId: string;
        readonly name: string;
        /** 由服务端 Schema 反射握手解码的状态树 */
        readonly state: TState;
        /** 每次（重）连接都会变化，做手动重连前先缓存 */
        readonly reconnectionToken: string;
        /** 0.17 自动重连配置 */
        reconnection: {
            enabled: boolean;
            maxRetries: number;
            minDelay: number;
            maxDelay: number;
            minUptime: number;
            maxEnqueuedMessages: number;
        };

        send(type: string | number, message?: any): void;
        /** 注册消息处理器（0.17 同一类型可注册多个），返回解绑函数 */
        onMessage<T = any>(type: string | number, callback: (message: T) => void): () => void;

        onStateChange: EventSignal<(state: TState) => void>;
        onError: EventSignal<(code: number, message?: string) => void>;
        /** 永久离开（自动重连失败/主动离开） */
        onLeave: EventSignal<(code: number, reason?: string) => void>;
        /** 连接掉线，自动重连开始 */
        onDrop: EventSignal<(code?: number, reason?: string) => void>;
        /** 自动重连成功（状态监听自动保留） */
        onReconnect: EventSignal<() => void>;

        leave(consented?: boolean): Promise<number>;
        removeAllListeners(): void;
    }

    /** 0.16 风格状态回调代理（0.17 仍导出，向后兼容） */
    function getStateCallbacks<TState = any>(room: Room<TState>): any;

    /** 0.17 文档推荐的状态回调 API */
    const Callbacks: {
        get<TState = any>(room: Room<TState>): {
            listen(path: string, callback: (value: any, previousValue: any) => void): () => void;
            onAdd(path: string, callback: (item: any, key: string) => void): () => void;
            onRemove(path: string, callback: (item: any, key: string) => void): () => void;
            onChange(instanceOrPath: any, callback: (...args: any[]) => void): () => void;
            bindTo(instance: any, target: any, props?: string[]): () => void;
        };
    };

    /** WebSocket 关闭码（Colyseus 保留 4000-4010） */
    const CloseCode: {
        NORMAL_CLOSURE: number;
        CONSENTED: number;
        WITH_ERROR: number;
        SERVER_SHUTDOWN: number;
        [key: string]: number;
    };
}
