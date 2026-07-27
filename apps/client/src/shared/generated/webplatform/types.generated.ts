// Generated from @gono/webplatform-contract. Do not edit.
export type paths = {
    "/livez": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["livez"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["readyz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/accounts/{userId}/ban": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["banAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/accounts/{userId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["revokeAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listAreas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/internal/characters/{userId}/{serverId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                serverId: components["parameters"]["ServerId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        get: operations["hasCharacter"];
        put: operations["registerCharacter"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/internal/sessions/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["verifySession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sessions/dev": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["devLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sessions/wechat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["wxLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["version"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        AdminAccountRequest: {
            operationId: string;
            reason: string;
        };
        AdminAccountResponse: {
            accountExists: boolean;
            /** @enum {string} */
            status: "banned" | "revoked" | "not_found";
        };
        AreaListResponse: {
            hash: string;
            isOps: boolean;
            myServerIds: number[];
            servers: components["schemas"]["AreaServer"][];
        };
        AreaServer: {
            gameHttpUrl: string;
            gameWsUrl: string;
            name: string;
            openTime: number;
            serverId: number;
            /** @enum {string} */
            status: "smooth" | "busy" | "maintenance";
            /** @enum {string} */
            tag: "normal" | "new" | "full" | "maintenance";
        };
        DevLoginRequest: {
            deviceId?: string | null;
            devKey: string;
            serverId: number;
        };
        ErrorResponse: {
            code: string;
            requestId: string;
        };
        HasCharacterResponse: {
            exists: boolean;
        };
        LiveResponse: {
            /** @constant */
            ok: true;
        };
        LoginResponse: {
            accessToken: string;
            isNewAccount: boolean;
            userId: string;
        };
        ReadyResponse: {
            ready: boolean;
        };
        RegisterCharacterResponse: {
            /** @constant */
            registered: true;
        };
        VerifySessionRequest: {
            accessToken: string;
            serverId: number;
        };
        VerifySessionResponse: {
            issuedAtMs: number;
            userId: string;
            /** @constant */
            valid: true;
        } | {
            /** @enum {string} */
            reason: "NOT_FOUND" | "MISMATCH" | "BANNED" | "DEREGISTERED" | "EXPIRED";
            /** @constant */
            valid: false;
        };
        VersionResponse: {
            contractVersion: string;
            gitSha: string;
            schemaVersion: number;
            /** @constant */
            service: "gono-webplatform";
            serviceVersion: string;
        };
        WxLoginRequest: {
            code: string;
            deviceId?: string | null;
            serverId: number;
        };
    };
    responses: {
        /** @description 入参不合法 */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 操作冲突 */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 禁止访问 */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 内部错误 */
        Internal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 不存在 */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 请求过频 */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 服务身份无效 */
        ServiceUnauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 用户身份无效 */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description 上游不可用 */
        Unavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: {
        ServerId: number;
        UserId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    livez: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 进程存活 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveResponse"];
                };
            };
        };
    };
    readyz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 依赖就绪 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadyResponse"];
                };
            };
            /** @description 未就绪 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadyResponse"];
                };
            };
        };
    };
    banAccount: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminAccountRequest"];
            };
        };
        responses: {
            /** @description 封号结果 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminAccountResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["ServiceUnauthorized"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["Internal"];
        };
    };
    revokeAccount: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminAccountRequest"];
            };
        };
        responses: {
            /** @description 撤销结果 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminAccountResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["ServiceUnauthorized"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["Internal"];
        };
    };
    listAreas: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 选服目录 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AreaListResponse"];
                };
            };
            500: components["responses"]["Internal"];
        };
    };
    hasCharacter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                serverId: components["parameters"]["ServerId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 是否存在角色 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HasCharacterResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["ServiceUnauthorized"];
            500: components["responses"]["Internal"];
        };
    };
    registerCharacter: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                serverId: components["parameters"]["ServerId"];
                userId: components["parameters"]["UserId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 幂等登记成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterCharacterResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["ServiceUnauthorized"];
            500: components["responses"]["Internal"];
        };
    };
    verifySession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifySessionRequest"];
            };
        };
        responses: {
            /** @description 校验结果；身份失败也返回 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifySessionResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["ServiceUnauthorized"];
            500: components["responses"]["Internal"];
        };
    };
    devLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevLoginRequest"];
            };
        };
        responses: {
            /** @description 登录成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["Internal"];
        };
    };
    wxLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WxLoginRequest"];
            };
        };
        responses: {
            /** @description 登录成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["Internal"];
            503: components["responses"]["Unavailable"];
        };
    };
    version: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 版本信息 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionResponse"];
                };
            };
        };
    };
}
