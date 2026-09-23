import { AtomicHashTransaction } from '@arthropoda/game-engine'
import type { NativeKitMaintenancePort } from '../../runtime/kit/NativeKitMaintenancePort'
import { GameDemoDrain } from './GameDemoDrain'
import { gameDemoLifecycle } from './GameDemoPersistence'

export const GameDemoMaintenance: NativeKitMaintenancePort = {
    version: 1,
    status: async () => (await AtomicHashTransaction.run((tx) => gameDemoLifecycle.state(tx))) ?? { phase: 'absent' },
    drain: (owner) => new GameDemoDrain().pass(owner),
    resume: () => gameDemoLifecycle.resume(),
    cancel: async (owner) => {
        const token = await gameDemoLifecycle.beginDrain(owner)
        await gameDemoLifecycle.cancelDrain(token)
    },
}
