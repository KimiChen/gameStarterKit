import type {
  IKitSamplePingReq,
  IKitSamplePingRes,
} from "../../../../generated/lobby-contract/protocol/lobbyRpc/domains/kitSample";
import { GameAction } from "../../../runtime/action/GameAction";

export class ActionKitSamplePing extends GameAction {
  async doAction(
    _request: IKitSamplePingReq,
    response: IKitSamplePingRes,
  ): Promise<void> {
    response.message = "pong";
  }
}
