/** 英雄招募 plugin：只把宿主 Lobby / navigation ports 组装成 Runtime，业务不进入 app 框架。 */
import type { PluginModule } from "../../app/PluginHost";
import { HeroRecruitRpc } from "../../shared/protocol/lobbyRpc/domains/heroRecruit";
import { setHeroRecruitRuntime } from "./logic/heroRecruitRuntime";

const ROUTE_ID = "heroRecruit";

export function createPluginModule(): PluginModule {
  return {
    install(context) {
      context.own(
        setHeroRecruitRuntime({
          getCatalog: () =>
            context.ports.lobbyRpc.query(HeroRecruitRpc.GetCatalog, {}),
          buy: (heroId) =>
            context.ports.lobbyRpc.sendIdempotent(HeroRecruitRpc.Buy, {
              heroId,
            }),
          close: () => context.ports.navigation.close(ROUTE_ID),
        }),
      );
    },
  };
}
