/**
 * 微信小游戏环境兼容补丁 —— 必须在任何 Colyseus 调用之前导入（Main.ts 第一行）。
 *
 * 背景（colyseus/colyseus#945，验证环境正是 Cocos 3.8.8 + Colyseus 0.17 + 微信小游戏）：
 *  - Cocos 微信适配层提供 WebSocket / XMLHttpRequest，但不提供
 *    fetch / Headers / URL / URLSearchParams / TextEncoder / TextDecoder；
 *    SDK 的 HTTP 匹配请求（fetch 缺失时走 XHR 兜底）仍会 new Headers() → 报
 *    "Headers is not defined"
 *  - wx 的 socket 只能发送 string | ArrayBuffer，而 Colyseus 发送 Uint8Array
 *  - SDK 连接时先尝试 new WebSocket(url, { headers, protocols })（Node 专用签名），
 *    浏览器会同步抛错回退，但微信适配层不校验，导致 options 对象被当作
 *    子协议传给 wx.connectSocket，连接失败
 *
 * 注意：不要使用 npm 的 url-polyfill（依赖 DOM，小游戏里报 a.checkValidity is not a function）。
 */
import { MINIGAME } from "cc/env";

const g = globalThis as any;

export function installWeChatCompat(): void {
    if (!MINIGAME) return;
    if (g.__gameWeChatCompatInstalled) return;
    g.__gameWeChatCompatInstalled = true;

    installHeaders();
    installURLSearchParams();
    installURL();
    installTextCodec();
    installBlob();
    patchWebSocket();
}

/**
 * 容错写入全局：微信开发者工具等环境会把部分全局（如 WebSocket）定义为只读，
 * 严格模式下直接赋值会抛 TypeError 并打断整个启动流程。
 */
function setGlobal(name: string, value: any, required: boolean): void {
    try {
        g[name] = value;
        if (g[name] === value) return;
    } catch { /* 尝试 defineProperty 兜底 */ }
    try {
        Object.defineProperty(g, name, { value, writable: true, configurable: true });
        return;
    } catch (e) {
        if (required) {
            console.error(`[wechat-compat] 无法设置全局 ${name}，相关功能会异常：`, e);
        }
        // 非必需（如替换只读的 WebSocket）：静默放弃
    }
}

// ---------------- Headers ----------------

function installHeaders(): void {
    if (typeof g.Headers !== "undefined") return;

    class HeadersPolyfill {
        private map = new Map<string, string>();

        constructor(init?: any) {
            if (!init) return;
            if (Array.isArray(init)) {
                for (const [k, v] of init) this.append(k, v);
            } else if (init instanceof HeadersPolyfill) {
                init.forEach((v: string, k: string) => this.append(k, v));
            } else if (typeof init === "object") {
                for (const k of Object.keys(init)) this.append(k, init[k]);
            }
        }
        append(name: string, value: string): void {
            const key = String(name).toLowerCase();
            const old = this.map.get(key);
            this.map.set(key, old ? `${old}, ${value}` : String(value));
        }
        set(name: string, value: string): void { this.map.set(String(name).toLowerCase(), String(value)); }
        get(name: string): string | null { return this.map.get(String(name).toLowerCase()) ?? null; }
        has(name: string): boolean { return this.map.has(String(name).toLowerCase()); }
        delete(name: string): void { this.map.delete(String(name).toLowerCase()); }
        forEach(cb: (value: string, key: string, parent: any) => void, thisArg?: any): void {
            this.map.forEach((v, k) => cb.call(thisArg, v, k, this));
        }
        keys() { return this.map.keys(); }
        values() { return this.map.values(); }
        entries() { return this.map.entries(); }
        [Symbol.iterator]() { return this.map.entries(); }
    }
    setGlobal("Headers", HeadersPolyfill, true);
}

// ---------------- URLSearchParams ----------------

function installURLSearchParams(): void {
    if (typeof g.URLSearchParams !== "undefined") return;

    class URLSearchParamsPolyfill {
        private pairs: Array<[string, string]> = [];

        constructor(init?: any) {
            if (!init) return;
            if (typeof init === "string") {
                const query = init.startsWith("?") ? init.slice(1) : init;
                for (const part of query.split("&")) {
                    if (!part) continue;
                    const eq = part.indexOf("=");
                    const k = eq >= 0 ? part.slice(0, eq) : part;
                    const v = eq >= 0 ? part.slice(eq + 1) : "";
                    this.pairs.push([decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " "))]);
                }
            } else if (Array.isArray(init)) {
                for (const [k, v] of init) this.pairs.push([String(k), String(v)]);
            } else if (typeof init === "object") {
                for (const k of Object.keys(init)) this.pairs.push([k, String(init[k])]);
            }
        }
        append(name: string, value: string): void { this.pairs.push([String(name), String(value)]); }
        set(name: string, value: string): void {
            this.delete(name);
            this.pairs.push([String(name), String(value)]);
        }
        get(name: string): string | null {
            const hit = this.pairs.find(([k]) => k === name);
            return hit ? hit[1] : null;
        }
        getAll(name: string): string[] { return this.pairs.filter(([k]) => k === name).map(([, v]) => v); }
        has(name: string): boolean { return this.pairs.some(([k]) => k === name); }
        delete(name: string): void { this.pairs = this.pairs.filter(([k]) => k !== name); }
        forEach(cb: (value: string, key: string, parent: any) => void, thisArg?: any): void {
            for (const [k, v] of this.pairs) cb.call(thisArg, v, k, this);
        }
        toString(): string {
            return this.pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
        }
        [Symbol.iterator]() { return this.pairs[Symbol.iterator](); }
    }
    setGlobal("URLSearchParams", URLSearchParamsPolyfill, true);
}

// ---------------- URL（无 DOM 依赖的最小实现） ----------------

function installURL(): void {
    if (typeof g.URL !== "undefined") return;

    const URL_RE = /^(https?|wss?):\/\/([^/?#:]+)(?::(\d+))?([^?#]*)(\?[^#]*)?(#.*)?$/i;

    class URLPolyfill {
        protocol: string;
        hostname: string;
        port: string;
        pathname: string;
        hash: string;
        searchParams: any;

        constructor(url: string, base?: string) {
            let full = url;
            // 极简 base 拼接：仅处理相对路径场景
            if (base && !/^[a-z]+:\/\//i.test(url)) {
                const b = new URLPolyfill(base);
                full = url.startsWith("/")
                    ? `${b.protocol}//${b.host}${url}`
                    : `${b.protocol}//${b.host}${b.pathname.replace(/[^/]*$/, "")}${url}`;
            }
            const m = URL_RE.exec(full);
            if (!m) throw new TypeError(`Invalid URL: ${url}`);
            this.protocol = m[1].toLowerCase() + ":";
            this.hostname = m[2];
            this.port = m[3] ?? "";
            this.pathname = m[4] || "/";
            this.hash = m[6] ?? "";
            this.searchParams = new g.URLSearchParams(m[5] ?? "");
        }
        /** search/href 从 searchParams 动态派生：SDK 重连时会往 searchParams 里塞
         *  reconnectionToken / skipHandshake，再读 href——静态字符串会把它们丢掉 */
        get search(): string {
            const q = this.searchParams.toString();
            return q ? `?${q}` : "";
        }
        get host(): string { return this.port ? `${this.hostname}:${this.port}` : this.hostname; }
        get origin(): string { return `${this.protocol}//${this.host}`; }
        get href(): string { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }
        toString(): string { return this.href; }
    }
    setGlobal("URL", URLPolyfill, true);
}

// ---------------- Blob（最小实现） ----------------
// SDK 的 xhrFetch 兜底对非 json/text 的响应会 new Blob(...)，缺失时抛 ReferenceError
// 而不是把真实的服务端错误暴露出来。

function installBlob(): void {
    if (typeof g.Blob !== "undefined") return;

    class BlobPolyfill {
        readonly type: string;
        private chunks: Uint8Array[];

        constructor(parts: any[] = [], options: { type?: string } = {}) {
            this.type = options.type ?? "";
            this.chunks = parts.map((p) => {
                if (typeof p === "string") return new g.TextEncoder().encode(p) as Uint8Array;
                if (p instanceof ArrayBuffer) return new Uint8Array(p.slice(0));
                if (ArrayBuffer.isView(p)) return new Uint8Array(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
                if (p instanceof BlobPolyfill) return p.bytes();
                return new g.TextEncoder().encode(String(p)) as Uint8Array;
            });
        }
        private bytes(): Uint8Array {
            const total = this.chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of this.chunks) {
                out.set(c, off);
                off += c.length;
            }
            return out;
        }
        get size(): number { return this.chunks.reduce((n, c) => n + c.length, 0); }
        arrayBuffer(): Promise<ArrayBuffer> { return Promise.resolve(this.bytes().slice().buffer); }
        text(): Promise<string> { return Promise.resolve(new g.TextDecoder().decode(this.bytes())); }
    }
    setGlobal("Blob", BlobPolyfill, true);
}

// ---------------- TextEncoder / TextDecoder（UTF-8） ----------------
// 说明：SDK（@colyseus/schema）在 TextEncoder/TextDecoder 缺失时有自带的纯 JS 回退，
// 且它在插件求值阶段就已捕获（拿到 undefined 走回退）——本补丁对 SDK 无效也无必要，
// 装上是给业务代码和其他第三方库用的。

function installTextCodec(): void {
    if (typeof g.TextEncoder === "undefined") {
        class TextEncoderPolyfill {
            readonly encoding = "utf-8";
            encode(input = ""): Uint8Array {
                const bytes: number[] = [];
                for (let i = 0; i < input.length; i++) {
                    let code = input.charCodeAt(i);
                    // 组合代理对
                    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
                        const next = input.charCodeAt(i + 1);
                        if (next >= 0xdc00 && next <= 0xdfff) {
                            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                            i++;
                        }
                    }
                    if (code < 0x80) {
                        bytes.push(code);
                    } else if (code < 0x800) {
                        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
                    } else if (code < 0x10000) {
                        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                    } else {
                        bytes.push(
                            0xf0 | (code >> 18),
                            0x80 | ((code >> 12) & 0x3f),
                            0x80 | ((code >> 6) & 0x3f),
                            0x80 | (code & 0x3f),
                        );
                    }
                }
                return new Uint8Array(bytes);
            }
            /** 特性检测友好：部分库优先走 encodeInto */
            encodeInto(source: string, dest: Uint8Array): { read: number; written: number } {
                let read = 0;
                let written = 0;
                for (let i = 0; i < source.length; ) {
                    const isPair =
                        source.charCodeAt(i) >= 0xd800 &&
                        source.charCodeAt(i) <= 0xdbff &&
                        i + 1 < source.length;
                    const chunkLen = isPair ? 2 : 1;
                    const bytes = this.encode(source.slice(i, i + chunkLen));
                    if (written + bytes.length > dest.length) break;
                    dest.set(bytes, written);
                    written += bytes.length;
                    read += chunkLen;
                    i += chunkLen;
                }
                return { read, written };
            }
        }
        setGlobal("TextEncoder", TextEncoderPolyfill, true);
    }

    if (typeof g.TextDecoder === "undefined") {
        class TextDecoderPolyfill {
            readonly encoding = "utf-8";
            decode(input?: ArrayBuffer | ArrayBufferView): string {
                if (!input) return "";
                const bytes = input instanceof Uint8Array
                    ? input
                    : ArrayBuffer.isView(input)
                        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
                        : new Uint8Array(input);
                let out = "";
                let i = 0;
                while (i < bytes.length) {
                    const b0 = bytes[i++];
                    let code: number;
                    if (b0 < 0x80) {
                        code = b0;
                    } else if (b0 < 0xe0) {
                        code = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
                    } else if (b0 < 0xf0) {
                        code = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
                    } else {
                        code = ((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
                    }
                    if (code >= 0x10000) {
                        code -= 0x10000;
                        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
                    } else {
                        out += String.fromCharCode(code);
                    }
                }
                return out;
            }
        }
        setGlobal("TextDecoder", TextDecoderPolyfill, true);
    }
}

// ---------------- WebSocket ----------------

function patchWebSocket(): void {
    const NativeWS = g.WebSocket;
    if (!NativeWS) return;

    // 1) 关键修复（构造签名问题必须在 wx.connectSocket 层解决）：
    //    SDK 是 UMD 插件脚本，在"插件求值阶段"（早于一切项目脚本、早于本补丁）就把
    //    globalThis.WebSocket 捕获进了模块作用域常量，事后替换全局 WebSocket 对 SDK 无效。
    //    SDK 连接时先尝试 Node 专用签名 new WebSocket(url, { headers, protocols })：
    //    浏览器同步抛错走回退分支，但微信适配层不校验，会把这个 options 对象包成
    //    [options] 传给 wx.connectSocket 的 protocols（Sec-WebSocket-Protocol 变成
    //    "[object Object]"），握手静默失败，SDK 的回退分支永远走不到。
    //    因此在 wx.connectSocket 入口清洗 protocols：只保留字符串子协议。
    try {
        if (typeof g.wx?.connectSocket === "function") {
            const origConnect = g.wx.connectSocket.bind(g.wx);
            g.wx.connectSocket = (opts: any) => {
                const raw = Array.isArray(opts?.protocols) ? opts.protocols : [];
                const protocols = raw.flatMap((x: any) =>
                    typeof x === "string"
                        ? [x]
                        : x && typeof x === "object" && x.protocols
                            ? ([] as any[]).concat(x.protocols).filter((s: any) => typeof s === "string")
                            : []);
                const next = { ...opts };
                if (protocols.length > 0) next.protocols = protocols;
                else delete next.protocols;
                return origConnect(next);
            };
        }
    } catch (e) {
        console.error("[wechat-compat] 包装 wx.connectSocket 失败，微信端连接可能异常（见 colyseus#945）：", e);
    }

    // 2) 发送数据规整：wx socket 只接受 string | ArrayBuffer。
    //    这个补丁打在 NativeWS.prototype 上，SDK 捕获的构造器共享同一原型，因此有效。
    //    注意 slice()：Uint8Array 可能是大 buffer 上带 byteOffset 的视图，直接取 .buffer 会发错数据。
    try {
        const nativeSend = NativeWS.prototype.send;
        NativeWS.prototype.send = function (data: any) {
            if (data instanceof Uint8Array) {
                nativeSend.call(this, data.slice().buffer);
            } else if (Array.isArray(data)) {
                nativeSend.call(this, new Uint8Array(data).buffer);
            } else {
                nativeSend.call(this, data);
            }
        };
    } catch (e) {
        console.error("[wechat-compat] 修补 WebSocket.prototype.send 失败，二进制消息可能发送异常：", e);
    }

    // 3) 全局构造签名规整：对已捕获 WebSocket 的 SDK 无效（见上），只服务于
    //    运行期才读取全局 WebSocket 的其他代码——属可选增强。
    //    微信开发者工具把全局 WebSocket 定义为只读，直接赋值会抛
    //    "Cannot assign to read only property 'WebSocket'"，所以必须容错且允许失败。
    function WrappedWebSocket(this: any, url: string, protocols?: any) {
        if (protocols && typeof protocols !== "string" && !Array.isArray(protocols)) {
            protocols = (protocols as any).protocols;
        }
        return protocols ? new NativeWS(url, protocols) : new NativeWS(url);
    }
    WrappedWebSocket.prototype = NativeWS.prototype;
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
        (WrappedWebSocket as any)[key] = NativeWS[key];
    }
    setGlobal("WebSocket", WrappedWebSocket, false);
}
