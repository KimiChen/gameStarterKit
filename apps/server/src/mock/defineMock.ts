/**
 * mock 端点描述对象与响应包装（与 websocket/rpc.ts 的 defineRpc 同风格）。
 *
 * mock 常驻供客户端无栈调试。生命周期约定：真实实现落地后，在对应 mock 文件头
 * 标记「⚠ 已替换 → <真实实现路径>（日期）」，⛔ 不删除；mock 与真实接口的差异
 * 只允许是「假数据」，不允许是「假协议」——req/res 类型必须 import shared 契约，
 * 协议漂移由 typecheck 兜住。
 */
import type { Request, Response } from "express";
import { ErrorCode, ErrorMessage, type IApiResponse } from "@game/shared";

export interface MockEndpoint {
    method: "get" | "post";
    path: string;
    handler: (req: Request, res: Response) => void;
}

/** 类型钉子：无副作用，装配由 mock/index.ts 扫描完成（建文件即生效）。 */
export function defineMock(ep: MockEndpoint): MockEndpoint {
    return ep;
}

export function ok<T>(data: T): IApiResponse<T> {
    return { code: ErrorCode.Ok, message: ErrorMessage[ErrorCode.Ok], data };
}

export function fail(code: number): IApiResponse<null> {
    return { code, message: ErrorMessage[code] ?? "error", data: null };
}
