import { GameDemoRpc } from "../../../../../shared/src/native/lobbyRpc/domains/gameDemo";
import type { LobbyRpcVectorFile } from "./types";

export default {
  [GameDemoRpc.Status]: { request: {}, response: { kit: "gameDemo", runtime: "serverNew", stage: "P0" } },
  [GameDemoRpc.Assets]: { request: {}, response: { initialized: false, revision: 0, gold: 0, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } } },
  [GameDemoRpc.Initialize]: { request: { clientReqId: "init-one" }, response: { initialized: true, revision: 1, gold: 5000, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } } },
  [GameDemoRpc.Shop]: { request: {}, response: { assets: { initialized: true, revision: 1, gold: 5000, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } }, day: "2026-09-22", purchased: { herb: 0, dew: 0 } } },
  [GameDemoRpc.Buy]: { request: { clientReqId: "buy-one", product: "herb", count: 1 }, response: { initialized: true, revision: 3, gold: 4990, items: { herb: 1, dew: 0, pill: 0, finePill: 0 } } },
  [GameDemoRpc.MailList]: { request: {}, response: { revision: 0, mails: [] } },
  [GameDemoRpc.MailRead]: { request: { clientReqId: "read", mailId: "0123456789abcdef0123456789abcdef" }, response: { revision: 0, mails: [] } },
  [GameDemoRpc.MailClaim]: { request: { clientReqId: "claim", mailId: "0123456789abcdef0123456789abcdef" }, response: { assets: { initialized: true, revision: 2, gold: 5100, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } }, mailbox: { revision: 2, mails: [] } } },
} satisfies LobbyRpcVectorFile;
