/**
 * dev 公开端点（AUTH_PROVIDER=dev 时由 app.config.ts 挂载；铁律 12 的非生产显式例外）。
 *
 * 复刻锁定契约的**路径与响应形状**（`/v1/sessions/dev`、`/v1/areas`），让客户端
 * devLogin/fetchAreaList 把 portal 指到游戏服即可直连——登录与选服生产上属于
 * WebPlatform Public API（⛔ 游戏服在生产环境不挂兼容代理，本文件只在 dev 提供
 * 进程内开发实现）。响应在发出前过锁定契约的 runtime validator（shared/generated/
 * webplatform），防止 dev 影子实现与真契约漂移。
 */
import type { Application, Request, Response } from "express";
import express from "express";
import {
    validateWebPlatformAreaListResponse,
    validateWebPlatformDevLoginRequest,
    validateWebPlatformLoginResponse,
    WebPlatformPath,
    type WebPlatformAreaListResponse,
    type WebPlatformLoginResponse,
} from "@game/shared";
import { PORT } from "../../core/infra/config";
import { issueDevSession } from "../../platform/devAuthProvider";

/** 本机单服目录（dev）：serverId=0 与 GROUP_ZONES 空（承载全部）同语义。 */
function devAreaList(): WebPlatformAreaListResponse {
    const origin = `http://127.0.0.1:${PORT}`;
    const response: WebPlatformAreaListResponse = {
        hash: `dev-${PORT}`,
        isOps: false,
        myServerIds: [],
        servers: [{
            gameHttpUrl: origin,
            gameWsUrl: `ws://127.0.0.1:${PORT}`,
            name: "本地开发服",
            openTime: 1, // >0 = 已开服（isServerEnterable 语义）
            serverId: 0,
            status: "smooth",
            tag: "normal",
        }],
    };
    return validateWebPlatformAreaListResponse(response);
}

function sendError(res: Response, status: number, code: string): void {
    res.status(status).json({ code, requestId: "dev" });
}

/** 挂载 dev 公开端点（仅 AUTH_PROVIDER=dev；调用方负责闸）。 */
export function mountDevPublicEndpoints(app: Application): void {
    app.post(WebPlatformPath.DevLogin, express.json(), async (req: Request, res: Response) => {
        try {
            const input = validateWebPlatformDevLoginRequest(req.body);
            const session = await issueDevSession(input.devKey, input.serverId);
            const response: WebPlatformLoginResponse = validateWebPlatformLoginResponse({
                accessToken: session.token,
                isNewAccount: false, // dev 下不区分新旧账号（⛔ 不装账号语义）
                userId: session.userId,
            });
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof Error && error.name === "AuthRequiredError") {
                sendError(res, 401, "AUTH_REQUIRED");
                return;
            }
            if (error instanceof Error && error.name === "WireValidationError") {
                sendError(res, 400, "INVALID_PAYLOAD");
                return;
            }
            console.error("[dev-auth] /v1/sessions/dev 失败", error);
            sendError(res, 500, "INTERNAL");
        }
    });

    app.get(WebPlatformPath.ListAreas, async (_req: Request, res: Response) => {
        try {
            res.status(200).json(devAreaList());
        } catch (error) {
            console.error("[dev-auth] /v1/areas 失败", error);
            sendError(res, 500, "INTERNAL");
        }
    });
}
