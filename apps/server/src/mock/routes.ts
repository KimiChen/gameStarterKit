import express, { type Application, type Request, type Response } from "express";
import {
    ApiPath,
    ErrorCode,
    ErrorMessage,
    type IApiResponse,
    type ILoginReq,
    type ILoginRes,
    type IPlayerProfile,
    type IRankRes,
    type IHealthRes,
} from "@game/shared";
import { mockLogin, mockProfileByToken, mockRank } from "./data";

function ok<T>(data: T): IApiResponse<T> {
    return { code: ErrorCode.Ok, message: ErrorMessage[ErrorCode.Ok], data };
}

function fail(code: number): IApiResponse<null> {
    return { code, message: ErrorMessage[code] ?? "error", data: null };
}

/**
 * HTTP 模拟接口 —— 路径与请求/响应类型全部来自 @game/shared 的 ApiPath 协议。
 */
export function registerMockRoutes(app: Application) {
    app.use(express.json());

    // POST /api/login —— mock：任意 code 都登录成功
    app.post(ApiPath.Login, (req: Request, res: Response) => {
        const body = (req.body ?? {}) as Partial<ILoginReq>;
        if (typeof body.code !== "string" || body.code.length === 0) {
            res.json(fail(ErrorCode.BadRequest));
            return;
        }
        const data: ILoginRes = mockLogin(body.code);
        res.json(ok(data));
    });

    // GET /api/player/profile —— 需要 Authorization: Bearer <token>
    app.get(ApiPath.Profile, (req: Request, res: Response) => {
        const auth = req.header("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        const profile: IPlayerProfile | undefined = mockProfileByToken(token);
        if (!profile) {
            res.json(fail(ErrorCode.TokenExpired));
            return;
        }
        res.json(ok(profile));
    });

    // GET /api/rank
    app.get(ApiPath.Rank, (_req: Request, res: Response) => {
        const data: IRankRes = { list: mockRank(), myRank: -1 };
        res.json(ok(data));
    });

    // GET /api/health
    app.get(ApiPath.Health, (_req: Request, res: Response) => {
        const data: IHealthRes = { status: "ok", serverTime: Date.now(), version: "0.1.0-mock" };
        res.json(ok(data));
    });
}
