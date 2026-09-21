import { monitor, playground } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { AUTH_PROVIDER, MAX_WS_PAYLOAD_BYTES } from "./core/infra/config";
import { routes } from "./http/index";
import { mountDevPublicEndpoints } from "./http/_support/devPublic";
import { createDevAuthProvider } from "./platform/devAuthProvider";
import { installWebPlatformClient } from "./platform/webPlatformClient";
import type { Application } from "express";

/** 每个进程一份 HTTP / transport / auth 装配；不登记任何房型或后台循环。 */
export function processServerOptions() {
    if (AUTH_PROVIDER === "dev") installWebPlatformClient(createDevAuthProvider());
    return {
        routes,
        transport: new WebSocketTransport({ maxPayload: MAX_WS_PAYLOAD_BYTES }),
        express: async (app: Application) => {
            if (AUTH_PROVIDER === "dev") mountDevPublicEndpoints(app);
            // 管理面只在非生产挂载；生产运维须在已鉴权反代后另行装配。
            if (process.env.NODE_ENV !== "production") {
                app.use("/monitor", monitor());
                app.use("/", playground());
            }
        },
    };
}
