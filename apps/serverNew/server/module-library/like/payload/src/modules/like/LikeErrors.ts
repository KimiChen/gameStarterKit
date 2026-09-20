import { GameError } from '@arthropoda/game-engine'

export class LikeErrors {
    static readonly LikeCantLike = new GameError(231001, '该玩家没上榜')

    static readonly LikeHasLiked = new GameError(231002, '您已经给该玩家点过赞了')

    static readonly LikeNoLikeRank = new GameError(231003, '该榜单不能被点赞')
}
