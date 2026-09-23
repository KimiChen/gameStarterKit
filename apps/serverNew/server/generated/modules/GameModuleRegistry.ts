import type { GameModuleRegistryEntry } from '../../src/startup/GameModule'
import { ActivityModule } from '../../src/modules/activity/ActivityModule'
import { AdjustModule } from '../../src/modules/adjust/AdjustModule'
import { AdsModule } from '../../src/modules/ads/AdsModule'
import { AttrModule } from '../../src/modules/attr/AttrModule'
import { ChatModule } from '../../src/modules/chat/ChatModule'
import { ClientConfigModule } from '../../src/modules/clientConfig/ClientConfigModule'
import { DiagnosticsModule } from '../../src/modules/diagnostics/DiagnosticsModule'
import { EquipModule } from '../../src/modules/equip/EquipModule'
import { FriendModule } from '../../src/modules/friend/FriendModule'
import { GameDemoModule } from '../../src/modules/gameDemo/GameDemoModule'
import { GmModule } from '../../src/modules/gm/GmModule'
import { GongModule } from '../../src/modules/gong/GongModule'
import { GuildModule } from '../../src/modules/guild/GuildModule'
import { HeroRecruitModule } from '../../src/modules/heroRecruit/HeroRecruitModule'
import { IncomeModule } from '../../src/modules/income/IncomeModule'
import { MailModule } from '../../src/modules/mail/MailModule'
import { MissionModule } from '../../src/modules/mission/MissionModule'
import { PayModule } from '../../src/modules/pay/PayModule'
import { PracticeModule } from '../../src/modules/practice/PracticeModule'
import { PropsModule } from '../../src/modules/props/PropsModule'
import { RankModule } from '../../src/modules/rank/RankModule'
import { SceneModule } from '../../src/modules/scene/SceneModule'
import { ServerSettingsModule } from '../../src/modules/serverSettings/ServerSettingsModule'
import { TaskModule } from '../../src/modules/task/TaskModule'
import { TitleModule } from '../../src/modules/title/TitleModule'
import { UserModule } from '../../src/modules/user/UserModule'
import { WeaponModule } from '../../src/modules/weapon/WeaponModule'

export const gameModuleRegistry = Object.freeze([
    { moduleName: 'activity', source: 'src/modules/activity/ActivityModule.ts', module: ActivityModule },
    { moduleName: 'adjust', source: 'src/modules/adjust/AdjustModule.ts', module: AdjustModule },
    { moduleName: 'ads', source: 'src/modules/ads/AdsModule.ts', module: AdsModule },
    { moduleName: 'attr', source: 'src/modules/attr/AttrModule.ts', module: AttrModule },
    { moduleName: 'chat', source: 'src/modules/chat/ChatModule.ts', module: ChatModule },
    { moduleName: 'clientConfig', source: 'src/modules/clientConfig/ClientConfigModule.ts', module: ClientConfigModule },
    { moduleName: 'diagnostics', source: 'src/modules/diagnostics/DiagnosticsModule.ts', module: DiagnosticsModule },
    { moduleName: 'equip', source: 'src/modules/equip/EquipModule.ts', module: EquipModule },
    { moduleName: 'friend', source: 'src/modules/friend/FriendModule.ts', module: FriendModule },
    { moduleName: 'gameDemo', source: 'src/modules/gameDemo/GameDemoModule.ts', module: GameDemoModule },
    { moduleName: 'gm', source: 'src/modules/gm/GmModule.ts', module: GmModule },
    { moduleName: 'gong', source: 'src/modules/gong/GongModule.ts', module: GongModule },
    { moduleName: 'guild', source: 'src/modules/guild/GuildModule.ts', module: GuildModule },
    { moduleName: 'heroRecruit', source: 'src/modules/heroRecruit/HeroRecruitModule.ts', module: HeroRecruitModule },
    { moduleName: 'income', source: 'src/modules/income/IncomeModule.ts', module: IncomeModule },
    { moduleName: 'mail', source: 'src/modules/mail/MailModule.ts', module: MailModule },
    { moduleName: 'mission', source: 'src/modules/mission/MissionModule.ts', module: MissionModule },
    { moduleName: 'pay', source: 'src/modules/pay/PayModule.ts', module: PayModule },
    { moduleName: 'practice', source: 'src/modules/practice/PracticeModule.ts', module: PracticeModule },
    { moduleName: 'props', source: 'src/modules/props/PropsModule.ts', module: PropsModule },
    { moduleName: 'rank', source: 'src/modules/rank/RankModule.ts', module: RankModule },
    { moduleName: 'scene', source: 'src/modules/scene/SceneModule.ts', module: SceneModule },
    { moduleName: 'serverSettings', source: 'src/modules/serverSettings/ServerSettingsModule.ts', module: ServerSettingsModule },
    { moduleName: 'task', source: 'src/modules/task/TaskModule.ts', module: TaskModule },
    { moduleName: 'title', source: 'src/modules/title/TitleModule.ts', module: TitleModule },
    { moduleName: 'user', source: 'src/modules/user/UserModule.ts', module: UserModule },
    { moduleName: 'weapon', source: 'src/modules/weapon/WeaponModule.ts', module: WeaponModule },
] satisfies readonly GameModuleRegistryEntry[])
