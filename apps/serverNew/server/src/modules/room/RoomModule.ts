import { defineGameModule } from '../../startup/GameModule'
import { assertInviteProfilesDeclared } from './lobby/RoomGameplayCatalog'

/**
 * room 模块：路由面由 `apps/shared/schema/protocols/C2S/room.json` 声明并生成 Action。
 *
 * 私房玩法目录与邀请码策略的一致性**必须在启动阶段挡下**，所以这里保留一条启动贡献。
 * ⛔ 不要把它挪回路由注册（路由已不再由模块登记），也不要降级成请求期校验：
 * catalog 与 GameRoom 策略漂移属于配置错误，让它带着错误配置对外提供服务就是事故。
 */
export const RoomModule = defineGameModule({
    name: 'room',
    schemaOnly: true,
    startup: [
        {
            name: 'assert-room-gameplay-catalog',
            app: 'service',
            phase: 'configuration-loaded',
            scope: 'process',
            run: assertInviteProfilesDeclared,
        },
    ],
})
