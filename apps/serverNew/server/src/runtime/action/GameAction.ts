import { IActionLogic } from '@arthropoda/game-engine'
import { ActionUser } from '../../modules/user/action/ActionUser'

/** 游戏业务共享的公共 Action。 */
export class GameAction extends ActionUser implements IActionLogic {}
