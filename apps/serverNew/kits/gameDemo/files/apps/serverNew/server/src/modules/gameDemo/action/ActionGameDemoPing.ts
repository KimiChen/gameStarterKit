import type {
  IGameDemoPingReq,
  IGameDemoPingRes,
} from "../../../../generated/lobby-contract/protocol/lobbyRpc/domains/gameDemo";
import { GameAction } from "../../../runtime/action/GameAction";

export class ActionGameDemoPing extends GameAction {
  async doAction(
    _request: IGameDemoPingReq,
    response: IGameDemoPingRes,
  ): Promise<void> {
    response.message = "pong";
  }
}
