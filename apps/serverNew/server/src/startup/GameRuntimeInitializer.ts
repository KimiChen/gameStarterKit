import { EngineInitHelper } from '@arthropoda/game-engine'
import { modInfos } from '../../generated/bean/mod-infos'
import { RpcAttachTask } from '../runtime/action/RpcAttachTask'
import { GameActionContext } from '../runtime/context/GameActionContext'
import { SystemErrors } from '../runtime/errors/SystemErrors'
import { GameEventAttachTask } from '../runtime/event/GameEventAttachTask'
import { TelemetryAttachTask } from '../telemetry/TelemetryAttachTask'
import { TelemetryPropertiesRegistry } from '../telemetry/TelemetryPropertiesRegistry'
import { GameModuleCatalog } from './GameModuleCatalog'

/** 平台分配的id，平台的正式环境与平台的其他环境通过不同段来划分 */
export const PLATFORM_IDS: { [platfor: string]: int } = {
    bearjoy: 1,
    xiaoyouxi: 2,
}

export class GameRuntimeInitializer {
    /**
     * 加载完配置后,初始化游戏
     */
    static async init() {
        TelemetryPropertiesRegistry.setProviders(
            GameModuleCatalog.systems.telemetry.entries
                .filter((entry) => entry.contribution.app === 'service' || entry.contribution.app === 'all')
                .map((entry) => entry.contribution.provider),
        )

        EngineInitHelper.initSomeGameError({
            runtimeError: SystemErrors.RuntimeError,
            logicError: SystemErrors.ProtectActionException,
            requestError: SystemErrors.ProtectRequestError,
            sysNoConf: SystemErrors.SysNoConf,
            apiCallQueueTimeout: SystemErrors.ApiCallQueueTimeout,
        })

        // action业务 前处理 后处理 注册
        for (const entry of GameModuleCatalog.systems.actions.entries) {
            if (entry.contribution.app === 'service' || entry.contribution.app === 'all') {
                EngineInitHelper.addActionAttackTask(entry.contribution.task)
            }
        }
        EngineInitHelper.addActionAttackTask(RpcAttachTask)
        EngineInitHelper.addActionAttackTask(TelemetryAttachTask)
        EngineInitHelper.addActionAttackTask(GameEventAttachTask)
        // 平台注册
        EngineInitHelper.initPlatformLineInfo(PLATFORM_IDS)
        EngineInitHelper.initContextFactory({ newContext: () => new GameActionContext() })
        EngineInitHelper.initModInfoRegistry(modInfos)
    }
}
