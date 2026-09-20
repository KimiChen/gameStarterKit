import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

export const projectRoot = path.resolve(__dirname, '../..')
export const libraryRoot = path.join(projectRoot, 'module-library')
const catalogPath = path.join(libraryRoot, 'catalog.json')
const statePath = path.join(libraryRoot, '.installed.json')
const sourceModulesRoot = path.join(projectRoot, 'src/modules')

export const packageNames = [
    'equip',
    'weapon',
    'gong',
    'achieve',
    'worship',
    'scene',
    'mission',
    'arena',
    'tower',
    'lode',
    'fightLog',
    'plant',
    'love',
    'wife',
    'shop',
    'survey',
    'subscribe',
    'triggerGift',
    'like',
    'serverProgress',
    'worldLevel',
    'test',
] as const

export type Integration =
    | {
          id: string
          type: 'addImport'
          target: string
          moduleSpecifier: string
          import: string
          expectedAbsent?: string
      }
    | {
          id: string
          type: 'addClassMember'
          target: string
          className: string
          member: string
          expectedAbsent: string
      }
    | {
          id: string
          type: 'addStatement'
          target: string
          functionName: string
          statement: string
          after: string
          expectedAbsent: string
      }
    | {
          id: string
          type: 'addClassImplements'
          target: string
          className: string
          implements: string
          expectedAbsent: string
      }
    | {
          id: string
          type: 'insertAfterText'
          target: string
          after: string
          text: string
          expectedAbsent: string
      }

export interface ManifestFile {
    target: string
    payload: string
    sha256: string
}

export interface ConfigFragment {
    target: string
    entries: Record<string, unknown>
}

export interface ModuleManifest {
    schemaVersion: 1
    name: string
    version: string
    description: string
    files: ManifestFile[]
    dependencies: {
        base: string[]
        hard: string[]
        optional: string[]
    }
    integrations: Integration[]
    configFragments: ConfigFragment[]
    verification: {
        commands: string[]
        manual: string[]
    }
}

interface CatalogEntry {
    name: string
    version: string
    description: string
    dependencies: string[]
    packagePath: string
}

interface Catalog {
    schemaVersion: 1
    packages: CatalogEntry[]
}

interface InstallState {
    schemaVersion: 1
    packages: Record<string, { version: string; installedAt: string; files: string[] }>
}

export interface ModuleAudit {
    name: string
    active: boolean
    files: string[]
    tests: string[]
    hardDependencies: string[]
    incomingReferences: string[]
    memberReferences: string[]
    configTables: string[]
    configCandidates: string[]
}

export interface ArchivePlan {
    name: string
    files: string[]
    tests: string[]
    hardDependencies: string[]
    incomingReferences: string[]
    memberReferences: string[]
}

interface ArchiveRecipe {
    files: string[]
    integrations: Integration[]
    memberNames?: string[]
}

const archiveRecipes: Partial<Record<(typeof packageNames)[number], ArchiveRecipe>> = {
    plant: {
        files: ['config_game/peach_orchard.json'],
        integrations: [
            {
                id: 'user-plant-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../plant/bean/PlantBean',
                import: "import { PlantBean } from '../../plant/bean/PlantBean'",
                expectedAbsent: 'PlantBean',
            },
            {
                id: 'user-plant-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@Mod\nplant!: PlantBean',
                expectedAbsent: 'plant!: PlantBean',
            },
        ],
    },
    love: {
        files: ['config_game/love.json'],
        integrations: [
            {
                id: 'user-love-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../love/bean/LoveRecordItem',
                import: "import { LoveRecordItem } from '../../love/bean/LoveRecordItem'",
                expectedAbsent: 'LoveRecordItem',
            },
            {
                id: 'user-love-fields',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: 'love: int = 0\n\n@Mod\nloveRecord?: DiffMap<int, LoveRecordItem>',
                expectedAbsent: 'loveRecord?: DiffMap<int, LoveRecordItem>',
            },
            {
                id: 'mission-love-import',
                type: 'addImport',
                target: 'src/modules/mission/action/ActionMission.ts',
                moduleSpecifier: '../../love/action/ActionLove',
                import: "import { ActionLove } from '../../love/action/ActionLove'",
                expectedAbsent: 'ActionLove',
            },
            {
                id: 'mission-love-day-init',
                type: 'insertAfterText',
                target: 'src/modules/mission/action/ActionMission.ts',
                after: '        // 爱心值奖励次数重置',
                text: '        ActionLove.dayInit(user)',
                expectedAbsent: 'ActionLove.dayInit(user)',
            },
            {
                id: 'mission-love-order',
                type: 'insertAfterText',
                target: 'src/modules/mission/MissionModule.ts',
                after: "app: 'all',",
                text: " after: ['love'],",
                expectedAbsent: "after: ['love']",
            },
            {
                id: 'item-love-path',
                type: 'insertAfterText',
                target: 'src/modules/props/rules/ItemIdDefine.ts',
                after: "        skillRecoveryNum: 'skillRecoveryNum',",
                text: "        love: 'love',",
                expectedAbsent: "love: 'love'",
            },
            {
                id: 'item-love-cash-map',
                type: 'insertAfterText',
                target: 'src/modules/props/rules/ItemIdDefine.ts',
                after: '        [ItemIdDefine.ITEM_ID_SKILL_MP_NUM, this.USER_FIELD_PATH.skillRecoveryNum],',
                text: '        [ItemIdDefine.ITEM_ID_LOVE, this.USER_FIELD_PATH.love],',
                expectedAbsent: 'ITEM_ID_LOVE, this.USER_FIELD_PATH.love',
            },
        ],
    },
    achieve: {
        files: [
            'config_game/achievement_award.json',
            'config_game/achievement_label.json',
            'config_game/achievement_label_open.json',
            'config_game/achievement_medal.json',
        ],
        integrations: [
            {
                id: 'user-achieve-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../achieve/bean/UserAchieveBean',
                import: "import { UserAchieveBean } from '../../achieve/bean/UserAchieveBean'",
                expectedAbsent: 'UserAchieveBean',
            },
            {
                id: 'user-achieve-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@Mod\nachieve!: UserAchieveBean',
                expectedAbsent: 'achieve!: UserAchieveBean',
            },
            {
                id: 'user-login-achieve-mod',
                type: 'addStatement',
                target: 'src/modules/user/action/ActionGetUserInfo.ts',
                functionName: 'doAction',
                after: "    'redDotList',",
                statement: "    'achieve',",
                expectedAbsent: "    'achieve',",
            },
            {
                id: 'user-info-achieve-fields',
                type: 'addClassMember',
                target: 'src/modules/user/bean/UserInfoOnlyNetBean.ts',
                className: 'UserInfoOnlyNetBean',
                member: 'labelWears?: DiffArray<int>\nachievePoint: int = 0',
                expectedAbsent: 'achievePoint: int = 0',
            },
            {
                id: 'user-ref-achieve-labels',
                type: 'addClassMember',
                target: 'src/modules/user/ref/UserBaseRef.ts',
                className: 'UserBaseRef',
                member: "@FromData(User, 'achieve.labelWears')\nlabelWears?: DiffArray<int>",
                expectedAbsent: "@FromData(User, 'achieve.labelWears')",
            },
            {
                id: 'user-ref-achieve-point',
                type: 'addClassMember',
                target: 'src/modules/user/ref/UserBaseRef.ts',
                className: 'UserBaseRef',
                member: "@FromData(User, 'achieve.achievePoint')\nachievePoint: int = 0",
                expectedAbsent: "@FromData(User, 'achieve.achievePoint')",
            },
            {
                id: 'guild-ref-achieve-labels',
                type: 'addClassMember',
                target: 'src/modules/guild/ref/GuildMemberRef.ts',
                className: 'GuildMemberRef',
                member: "@FromData(User, 'achieve.labelWears')\nlabelWears?: DiffArray<int>",
                expectedAbsent: "@FromData(User, 'achieve.labelWears')",
            },
            {
                id: 'guild-ref-achieve-point',
                type: 'addClassMember',
                target: 'src/modules/guild/ref/GuildMemberRef.ts',
                className: 'GuildMemberRef',
                member: "@FromData(User, 'achieve.achievePoint')\nachievePoint: int = 0",
                expectedAbsent: "@FromData(User, 'achieve.achievePoint')",
            },
            {
                id: 'profile-ref-achieve',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserProfileFormatter.ts',
                after: '                race: query.race,',
                text: '                labelWears: query.labelWears,\n                achievePoint: query.achievePoint,',
                expectedAbsent: '                labelWears: query.labelWears,',
            },
            {
                id: 'profile-user-achieve',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserProfileFormatter.ts',
                after: '            race: query.race,',
                text: "            labelWears: query.achieve.labelWears as User['achieve']['labelWears'],\n            achievePoint: query.achieve.achievePoint,",
                expectedAbsent: '            labelWears: query.achieve.labelWears',
            },
        ],
    },
    test: {
        files: [
            'config_game/hero_lv.json',
            'src/modules/user/action/ActionModifyUserData.ts',
            'test/bean-compile/runtime-equivalence.test.ts',
        ],
        integrations: [
            {
                id: 'user-hero-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../test/bean/HeroBean',
                import: "import { HeroBean } from '../../test/bean/HeroBean'",
                expectedAbsent: 'HeroBean',
            },
            {
                id: 'user-hero-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: 'hero?: HeroBean',
                expectedAbsent: 'hero?: HeroBean',
            },
            {
                id: 'login-hero-import',
                type: 'addImport',
                target: 'src/modules/user/action/UserLoginInitializer.ts',
                moduleSpecifier: '../../test/bean/HeroBean',
                import: "import { HeroBean } from '../../test/bean/HeroBean'",
                expectedAbsent: 'HeroBean',
            },
            {
                id: 'login-hero-init',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserLoginInitializer.ts',
                after: '            user.gc = 10000',
                text: '            user.hero = new HeroBean({ hId: 1001, lv: 1 })',
                expectedAbsent: 'user.hero = new HeroBean',
            },
            {
                id: 'user-test-type-import',
                type: 'addImport',
                target: 'src/modules/user/UserC2S.ts',
                moduleSpecifier: '../test/TestC2S',
                import: "import { TaskType } from '../test/TestC2S'",
                expectedAbsent: 'TaskType',
            },
            {
                id: 'user-test-request',
                type: 'insertAfterText',
                target: 'src/modules/user/UserC2S.ts',
                after: 'export interface ResCultivate {\n    lv: int\n    exp: int\n    fp: int\n}',
                text: "\n\n/** 修改玩家测试数据 */\nexport interface ReqModifyUserData extends Service<'Base'> {\n    tp: TaskType\n}",
                expectedAbsent: 'ReqModifyUserData',
            },
        ],
        memberNames: ['hero'],
    },
    like: {
        files: [],
        integrations: [
            {
                id: 'user-like-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../like/bean/LikeRecordItem',
                import: "import { LikeRecordItem } from '../../like/bean/LikeRecordItem'",
                expectedAbsent: 'LikeRecordItem',
            },
            {
                id: 'user-like-fields',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 点赞数 */\nlike: int = 0\n\n/** 今日已点赞记录 */\nlikeRecords?: DiffMap<int, LikeRecordItem>',
                expectedAbsent: 'likeRecords?: DiffMap<int, LikeRecordItem>',
            },
            {
                id: 'user-info-like',
                type: 'addClassMember',
                target: 'src/modules/user/bean/UserInfoOnlyNetBean.ts',
                className: 'UserInfoOnlyNetBean',
                member: 'like: int = 0',
                expectedAbsent: 'like: int = 0',
            },
            {
                id: 'user-ref-like',
                type: 'addClassMember',
                target: 'src/modules/user/ref/UserBaseRef.ts',
                className: 'UserBaseRef',
                member: "@FromData(User, 'like')\nlike: int = 0",
                expectedAbsent: "@FromData(User, 'like')",
            },
            {
                id: 'guild-ref-like',
                type: 'addClassMember',
                target: 'src/modules/guild/ref/GuildMemberRef.ts',
                className: 'GuildMemberRef',
                member: "@FromData(User, 'like')\nlike: int = 0",
                expectedAbsent: "@FromData(User, 'like')",
            },
            {
                id: 'user-profile-ref-like',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserProfileFormatter.ts',
                after: '                faceDecorate: query.faceDecorate,',
                text: '                like: query.like,',
                expectedAbsent: '                like: query.like,',
            },
            {
                id: 'user-profile-user-like',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserProfileFormatter.ts',
                after: '            faceDecorate: query.faceDecorate,',
                text: '            like: query.like,',
                expectedAbsent: '            like: query.like,',
            },
        ],
    },
    shop: {
        files: ['config_game/shop.json'],
        integrations: [
            {
                id: 'user-total-shop-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../shop/bean/TotalShopBean',
                import: "import { TotalShopBean } from '../../shop/bean/TotalShopBean'",
                expectedAbsent: 'TotalShopBean',
            },
            {
                id: 'user-total-shop-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@OnlyRedis\ntotalShop?: DiffMap<string, TotalShopBean>',
                expectedAbsent: 'totalShop?: DiffMap<string, TotalShopBean>',
            },
        ],
    },
    arena: {
        files: [],
        integrations: [
            {
                id: 'user-arena-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../arena/bean/ArenaUserItem',
                import: "import { ArenaUserItem } from '../../arena/bean/ArenaUserItem'",
                expectedAbsent: 'ArenaUserItem',
            },
            {
                id: 'user-arena-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@OnlyRedis\narena?: ArenaUserItem',
                expectedAbsent: 'arena?: ArenaUserItem',
            },
            {
                id: 'hserver-arena-import',
                type: 'addImport',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                moduleSpecifier: '../../arena/bean/ArenaServerBean',
                import: "import { ArenaServerBean } from '../../arena/bean/ArenaServerBean'",
                expectedAbsent: 'ArenaServerBean',
            },
            {
                id: 'hserver-arena-field',
                type: 'addClassMember',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                className: 'HServer',
                member: 'arena?: ArenaServerBean',
                expectedAbsent: 'arena?: ArenaServerBean',
            },
            {
                id: 'user-info-arena-import',
                type: 'addImport',
                target: 'src/modules/user/action/ActionGetUserInfo.ts',
                moduleSpecifier: '../../arena/bean/ArenaSeasonUser',
                import: "import { ArenaSeasonUser } from '../../arena/bean/ArenaSeasonUser'",
                expectedAbsent: 'ArenaSeasonUser',
            },
            {
                id: 'user-info-arena-loader',
                type: 'addStatement',
                target: 'src/modules/user/action/ActionGetUserInfo.ts',
                functionName: 'doAction',
                after: '    hServer: async (user: User) => UserServerSnapshot.load(user.sId, false),',
                statement: '    arenaSeasonUser: async (user: User) => ArenaSeasonUser.load(user.id),',
                expectedAbsent: 'arenaSeasonUser:',
            },
        ],
    },
    worship: {
        files: ['config_game/worship_skill.json'],
        integrations: [
            {
                id: 'user-worship-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../worship/bean/UserWorshipBean',
                import: "import { UserWorshipBean } from '../../worship/bean/UserWorshipBean'",
                expectedAbsent: 'UserWorshipBean',
            },
            {
                id: 'user-worship-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 供奉系统 */\n@Mod\nworship!: UserWorshipBean',
                expectedAbsent: 'worship!: UserWorshipBean',
            },
            {
                id: 'user-login-worship-mod',
                type: 'addStatement',
                target: 'src/modules/user/action/ActionGetUserInfo.ts',
                functionName: 'doAction',
                after: "    'tq',",
                statement: "    'worship',",
                expectedAbsent: "    'worship',",
            },
            {
                id: 'rank-worship-fp',
                type: 'insertAfterText',
                target: 'src/modules/user/rules/PowerScoreRules.ts',
                after: '                this.FP_TYPE_MAGIC_GET,',
                text: '                this.FP_TYPE_WORSHIP,',
                expectedAbsent: '                this.FP_TYPE_WORSHIP,',
            },
            {
                id: 'worship-fp-label',
                type: 'insertAfterText',
                target: 'src/modules/user/rules/PowerScoreRules.ts',
                after: "        [this.FP_TYPE_SORCERY, '妖术评分'],",
                text: "        [this.FP_TYPE_WORSHIP, '供奉评分'],",
                expectedAbsent: "[this.FP_TYPE_WORSHIP, '供奉评分']",
            },
            {
                id: 'worship-fp-map',
                type: 'insertAfterText',
                target: 'src/modules/user/action/UserFp.ts',
                after: '        2: this.updateModFp_2,',
                text: '        3: this.updateModFp_3,',
                expectedAbsent: '        3: this.updateModFp_3,',
            },
            {
                id: 'worship-fp-method',
                type: 'addClassMember',
                target: 'src/modules/user/action/UserFp.ts',
                className: 'UserFp',
                member: `static updateModFp_3(user: User): [number, number] {
    let fp = 0
    for (const [, worshipSkill] of user.worship.skills) {
        if (!worshipSkill.skillId) continue
        fp += C.worship_skill(worshipSkill.skillId).fp
    }
    return [fp, fp]
}`,
                expectedAbsent: 'static updateModFp_3',
            },
        ],
    },
    tower: {
        files: [],
        integrations: [
            {
                id: 'hserver-tower-import',
                type: 'addImport',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                moduleSpecifier: '../../tower/bean/TowerPassItem',
                import: "import { TowerPassItem } from '../../tower/bean/TowerPassItem'",
                expectedAbsent: 'TowerPassItem',
            },
            {
                id: 'hserver-tower-fields',
                type: 'addClassMember',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                className: 'HServer',
                member: '/** 爬塔已挑战成功的最高进度 */\ntowerMaxId: int = 0\n\n/** 爬塔首次通过信息 */\n@OnlyRedis\ntowerFirstPass?: DiffMap<int, TowerPassItem>',
                expectedAbsent: 'towerMaxId: int = 0',
            },
            {
                id: 'user-tower-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../tower/bean/TowerBean',
                import: "import { TowerBean } from '../../tower/bean/TowerBean'",
                expectedAbsent: 'TowerBean',
            },
            {
                id: 'user-tower-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@Mod\ntower!: TowerBean',
                expectedAbsent: 'tower!: TowerBean',
            },
        ],
    },
    worldLevel: {
        files: [],
        integrations: [
            {
                id: 'hserver-world-level-import',
                type: 'addImport',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                moduleSpecifier: '../../worldLevel/bean/PassItem',
                import: "import { PassItem } from '../../worldLevel/bean/PassItem'",
                expectedAbsent: 'PassItem',
            },
            {
                id: 'hserver-world-level-fields',
                type: 'addClassMember',
                target: 'src/modules/serverProgress/bean/HServer.ts',
                className: 'HServer',
                member: '/** 已完成世界等级 boss 阶段 */\nworldLevelBossIds?: DiffMap<int, PassItem>\n\n/** 已解锁的世界等级 boss */\n@OnlyRedis\nworldLevelBossUnlocks?: DiffArray<int>',
                expectedAbsent: 'worldLevelBossIds?: DiffMap<int, PassItem>',
            },
            {
                id: 'user-world-level-fields',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 参与世界等级 boss 集合 */\nworldLevelIds?: DiffArray<int>\n\n/** 已领取世界等级 boss 奖励地图集合 */\nworldLevelAwardsIds?: DiffArray<int>\n\n/** 已领取世界等级 boss 个人奖励地图集合 */\nworldLevelSelfAwardsIds?: DiffArray<int>',
                expectedAbsent: 'worldLevelIds?: DiffArray<int>',
            },
        ],
    },
    wife: {
        files: [],
        integrations: [
            {
                id: 'user-wife-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../wife/bean/WifeItem',
                import: "import { WifeItem } from '../../wife/bean/WifeItem'",
                expectedAbsent: 'WifeItem',
            },
            {
                id: 'user-wife-skill-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../wife/bean/WifeSkillEffectItem',
                import: "import { WifeSkillEffectItem } from '../../wife/bean/WifeSkillEffectItem'",
                expectedAbsent: 'WifeSkillEffectItem',
            },
            {
                id: 'user-wifes-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 红颜列表 */\n@Mod\nwifes?: DiffMap<int, WifeItem>',
                expectedAbsent: 'wifes?: DiffMap<int, WifeItem>',
            },
            {
                id: 'user-wife-skill-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 红颜技能效果 */\n@Mod\nwifeSkillEffect?: DiffMap<int, WifeSkillEffectItem>',
                expectedAbsent: 'wifeSkillEffect?: DiffMap<int, WifeSkillEffectItem>',
            },
        ],
    },
    lode: {
        files: ['config_game/lode.json'],
        integrations: [
            {
                id: 'user-lode-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../lode/bean/LodeUserBean',
                import: "import { LodeUserBean } from '../../lode/bean/LodeUserBean'",
                expectedAbsent: 'LodeUserBean',
            },
            {
                id: 'user-lode-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '@Mod\nlodeUser!: LodeUserBean',
                expectedAbsent: 'lodeUser!: LodeUserBean',
            },
        ],
    },
    subscribe: {
        files: [],
        integrations: [
            {
                id: 'user-subscribe-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../subscribe/bean/SubscribeItem',
                import: "import { SubscribeItem } from '../../subscribe/bean/SubscribeItem'",
                expectedAbsent: 'SubscribeItem',
            },
            {
                id: 'user-subscribe-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 订阅开关 */\n@Mod\nsubscribe?: DiffMap<int, SubscribeItem>',
                expectedAbsent: 'subscribe?: DiffMap<int, SubscribeItem>',
            },
        ],
    },
    triggerGift: {
        files: [],
        integrations: [
            {
                id: 'user-trigger-gift-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../triggerGift/bean/TriggerGiftGroupItem',
                import: "import { TriggerGiftGroupItem } from '../../triggerGift/bean/TriggerGiftGroupItem'",
                expectedAbsent: 'TriggerGiftGroupItem',
            },
            {
                id: 'user-trigger-gift-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 礼包信息 */\n@Mod\ntriggerGift?: DiffMap<int, TriggerGiftGroupItem>',
                expectedAbsent: 'triggerGift?: DiffMap<int, TriggerGiftGroupItem>',
            },
        ],
    },
    survey: {
        files: ['src/modules/channel/contracts/ChannelSurveyCallback.ts'],
        integrations: [
            {
                id: 'user-survey-import',
                type: 'addImport',
                target: 'src/modules/user/bean/User.ts',
                moduleSpecifier: '../../survey/bean/SurveyItem',
                import: "import { SurveyItem } from '../../survey/bean/SurveyItem'",
                expectedAbsent: 'SurveyItem',
            },
            {
                id: 'user-survey-field',
                type: 'addClassMember',
                target: 'src/modules/user/bean/User.ts',
                className: 'User',
                member: '/** 问卷调查 */\n@Mod\nsurvey?: DiffMap<int, SurveyItem>',
                expectedAbsent: 'survey?: DiffMap<int, SurveyItem>',
            },
            {
                id: 'user-login-survey-mod',
                type: 'addStatement',
                target: 'src/modules/user/action/ActionGetUserInfo.ts',
                functionName: 'doAction',
                after: "    'worship',",
                statement: "    'survey',",
                expectedAbsent: "    'survey',",
            },
            {
                id: 'yuechi-survey-import',
                type: 'addImport',
                target: 'src/modules/channel/yuechi/ChannelYueChi.ts',
                moduleSpecifier: '../contracts/ChannelSurveyCallback',
                import: "import { ChannelSurveyCallback } from '../contracts/ChannelSurveyCallback'",
                expectedAbsent: 'ChannelSurveyCallback',
            },
            {
                id: 'yuechi-survey-params-import',
                type: 'addImport',
                target: 'src/modules/channel/yuechi/ChannelYueChi.ts',
                moduleSpecifier: '../../survey/callbackContract/SurveyCallbackParams',
                import: "import { SurveyCallbackParams } from '../../survey/callbackContract/SurveyCallbackParams'",
                expectedAbsent: 'SurveyCallbackParams',
            },
            {
                id: 'yuechi-survey-interface',
                type: 'addClassImplements',
                target: 'src/modules/channel/yuechi/ChannelYueChi.ts',
                className: 'ChannelYueChi',
                implements: 'ChannelSurveyCallback',
                expectedAbsent: 'ChannelSurveyCallback',
            },
            {
                id: 'yuechi-survey-methods',
                type: 'addClassMember',
                target: 'src/modules/channel/yuechi/ChannelYueChi.ts',
                className: 'ChannelYueChi',
                member: `async surveyCallbackParse(params: { [K: string]: any }, header: IncomingHttpHeaders) {
    const sign = header['X-Sign']
    const time = Int(header['X-Timestamp'] as string)
    if (sign != this.genSign(params, time)) {
        Log.error('surveyCallbackParse:签名错误', null, { 'X-Sign: ': sign, 'sign: ': this.genSign(params, time) })
        return false
    }
    const data = new SurveyCallbackParams()
    data.roleId = params.roleId
    data.serverId = params.serverId
    data.surveyId = params.actId
    data.originParams = params
    return data
}

surveyCallbackResponse(code: int, msg: string, params?: SurveyCallbackParams) {
    return { code: code == 0 ? '00000' : code, tips: msg, description: msg, data: code == 0 ? { userId: params?.originParams.userId, serverId: params?.originParams.serverId, roleId: params?.originParams.roleId, orderId: params?.originParams.orderId } : {} }
}`,
                expectedAbsent: 'surveyCallbackParse',
            },
        ],
    },
}

export interface AddPlan {
    packages: string[][]
    files: { packageName: string; target: string; action: 'create' | 'skip' }[]
    integrations: { packageName: string; id: string; target: string }[]
    configFragments: { packageName: string; target: string; keys: string[] }[]
}

export function ensurePackageName(name: string) {
    if (!packageNames.includes(name as (typeof packageNames)[number])) {
        throw new Error(`unknown archive module: ${name}`)
    }
}

export function readCatalog(): Catalog {
    if (!fs.existsSync(catalogPath)) return { schemaVersion: 1, packages: [] }
    const catalog = readJson<Catalog>(catalogPath)
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages))
        throw new Error('invalid module-library/catalog.json')
    return catalog
}

export function readManifest(name: string): ModuleManifest {
    ensurePackageName(name)
    const manifestPath = path.join(libraryRoot, name, 'manifest.json')
    if (!fs.existsSync(manifestPath)) throw new Error(`archive package does not exist: ${name}`)
    const manifest = readJson<ModuleManifest>(manifestPath)
    validateManifest(manifest)
    return manifest
}

export function listArchived() {
    return readCatalog().packages.sort((left, right) => left.name.localeCompare(right.name))
}

export function archivePlan(name: string): ArchivePlan {
    ensurePackageName(name)
    const moduleRoot = path.join(sourceModulesRoot, name)
    if (!fs.existsSync(moduleRoot)) throw new Error(`active module does not exist: ${name}`)
    const recipe = archiveRecipes[name as keyof typeof archiveRecipes]
    const files = [...walk(moduleRoot).map(relative), ...(recipe?.files ?? [])].sort()
    const testRoot = path.join(projectRoot, 'test/modules', name)
    const tests = fs.existsSync(testRoot) ? walk(testRoot).map(relative).sort() : []
    const hardDependencies = findModuleImports(files).filter((dependency) => dependency !== name)
    return {
        name,
        files,
        tests,
        hardDependencies,
        incomingReferences: findIncomingReferences(name),
        memberReferences: findMemberReferences(name),
    }
}

export function archive(name: string) {
    return runOperation('archive', [name], () => archiveUnsafe(name))
}

function archiveUnsafe(name: string) {
    const plan = archivePlan(name)
    if (plan.incomingReferences.length > 0) {
        throw new Error(
            `${name} is still referenced by active code:\n${plan.incomingReferences.map((file) => `  ${file}`).join('\n')}`,
        )
    }
    const memberReferences = plan.memberReferences
    if (memberReferences.length > 0) {
        throw new Error(
            `${name} is still referenced through active member access:\n${memberReferences
                .map((file) => `  ${file}`)
                .join('\n')}`,
        )
    }
    const packageRoot = path.join(libraryRoot, name)
    const staging = `${packageRoot}.staging-${process.pid}`
    const previous = `${packageRoot}.previous-${process.pid}`
    let replacedPrevious = false
    try {
        fs.mkdirSync(path.join(staging, 'payload'), { recursive: true })
        const sourceFiles = [...plan.files, ...plan.tests]
        const manifestFiles = sourceFiles.map((target) => copyIntoPayload(staging, target))
        const manifest: ModuleManifest = {
            schemaVersion: 1,
            name,
            version: '1.0.0',
            description: `Archived ${name} game module`,
            files: manifestFiles,
            dependencies: { base: [], hard: plan.hardDependencies, optional: [] },
            integrations: archiveRecipes[name as keyof typeof archiveRecipes]?.integrations ?? [],
            configFragments: [],
            verification: { commands: [`pnpm verify:module -- ${name}`], manual: [] },
        }
        writeJson(path.join(staging, 'manifest.json'), manifest)
        writeJson(path.join(staging, 'verification.json'), manifest.verification)
        if (fs.existsSync(packageRoot)) {
            fs.renameSync(packageRoot, previous)
            replacedPrevious = true
        }
        fs.renameSync(staging, packageRoot)
        fs.rmSync(path.join(sourceModulesRoot, name), { recursive: true })
        for (const file of archiveRecipes[name as keyof typeof archiveRecipes]?.files ?? []) {
            fs.rmSync(safeTarget(file), { force: true })
        }
        const testRoot = path.join(projectRoot, 'test/modules', name)
        if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true })
        updateCatalog(manifest)
        const state = readInstallState()
        if (state.packages[name]) {
            delete state.packages[name]
            writeJson(statePath, state)
        }
        fs.rmSync(previous, { recursive: true, force: true })
        return plan
    } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true })
        if (replacedPrevious && !fs.existsSync(packageRoot) && fs.existsSync(previous))
            fs.renameSync(previous, packageRoot)
        throw error
    }
}

export function addPlan(names: string[]): AddPlan {
    if (names.length === 0) throw new Error('provide at least one module name')
    const manifests = dependencyClosure(names)
    const files: AddPlan['files'] = []
    const integrations: AddPlan['integrations'] = []
    const configFragments: AddPlan['configFragments'] = []
    for (const manifest of manifests) {
        for (const file of manifest.files) {
            const payload = safePayload(manifest.name, file)
            const target = safeTarget(file.target)
            const current = fs.existsSync(target) ? hashFile(target) : undefined
            if (current && current !== file.sha256)
                throw new Error(`conflict: ${relative(target)} differs from ${manifest.name} package`)
            if (hashFile(payload) !== file.sha256) throw new Error(`corrupt payload: ${relative(payload)}`)
            files.push({ packageName: manifest.name, target: relative(target), action: current ? 'skip' : 'create' })
        }
        for (const integration of manifest.integrations) {
            validateIntegration(integration)
            integrations.push({ packageName: manifest.name, id: integration.id, target: integration.target })
        }
        for (const fragment of manifest.configFragments) {
            validateConfigFragment(fragment)
            configFragments.push({
                packageName: manifest.name,
                target: fragment.target,
                keys: Object.keys(fragment.entries).sort(),
            })
        }
    }
    preflightIntegrations(manifests.flatMap((manifest) => manifest.integrations))
    preflightConfigFragments(manifests.flatMap((manifest) => manifest.configFragments))
    return { packages: stronglyConnectedGroups(manifests), files, integrations, configFragments }
}

export function add(names: string[]) {
    return runOperation('add', names, () => addUnsafe(names))
}

function addUnsafe(names: string[]) {
    const plan = addPlan(names)
    const manifests = dependencyClosure(names)
    const rollback = new Map<string, Buffer | undefined>()
    const touched = new Set<string>()
    const remember = (target: string) => {
        if (!rollback.has(target)) rollback.set(target, fs.existsSync(target) ? fs.readFileSync(target) : undefined)
        touched.add(target)
    }
    try {
        for (const manifest of manifests) {
            for (const file of manifest.files) {
                const target = safeTarget(file.target)
                if (fs.existsSync(target)) continue
                remember(target)
                fs.mkdirSync(path.dirname(target), { recursive: true })
                fs.copyFileSync(safePayload(manifest.name, file), target)
            }
        }
        for (const manifest of manifests) {
            for (const integration of manifest.integrations) applyIntegration(integration, remember)
            for (const fragment of manifest.configFragments) applyConfigFragment(fragment, remember)
        }
        const state = readInstallState()
        for (const manifest of manifests) {
            state.packages[manifest.name] = {
                version: manifest.version,
                installedAt: new Date().toISOString(),
                files: manifest.files.map((file) => file.target),
            }
        }
        remember(statePath)
        writeJson(statePath, state)
        return plan
    } catch (error) {
        rollbackChanges(rollback)
        throw error
    }
}

export function audit(name: string): ModuleAudit {
    ensurePackageName(name)
    const moduleRoot = path.join(sourceModulesRoot, name)
    if (!fs.existsSync(moduleRoot)) {
        const manifest = readManifest(name)
        return {
            name,
            active: false,
            files: manifest.files.map((file) => file.target).sort(),
            tests: manifest.files
                .map((file) => file.target)
                .filter((file) => file.startsWith('test/'))
                .sort(),
            hardDependencies: manifest.dependencies.hard,
            incomingReferences: [],
            memberReferences: [],
            configTables: [],
            configCandidates: [],
        }
    }
    const files = walk(moduleRoot).map(relative).sort()
    const configTables = [...new Set(files.flatMap((file) => configTablesIn(path.join(projectRoot, file))))].sort()
    const configCandidates = walk(path.join(projectRoot, 'config_game'))
        .map(relative)
        .filter((file) => configTables.some((table) => path.basename(file, '.json') === table))
        .sort()
    const testRoot = path.join(projectRoot, 'test/modules', name)
    return {
        name,
        active: true,
        files,
        tests: fs.existsSync(testRoot) ? walk(testRoot).map(relative).sort() : [],
        hardDependencies: findModuleImports(files).filter((dependency) => dependency !== name),
        incomingReferences: findIncomingReferences(name),
        memberReferences: findMemberReferences(name),
        configTables,
        configCandidates,
    }
}

export function doctor() {
    const errors: string[] = []
    const catalog = readCatalog()
    const names = new Set<string>()
    for (const entry of catalog.packages) {
        try {
            if (names.has(entry.name)) throw new Error('duplicate catalog entry')
            names.add(entry.name)
            const manifest = readManifest(entry.name)
            if (manifest.version !== entry.version) throw new Error('catalog version differs from manifest')
            for (const file of manifest.files) {
                const payload = safePayload(manifest.name, file)
                if (!fs.existsSync(payload) || hashFile(payload) !== file.sha256)
                    throw new Error(`invalid payload ${file.payload}`)
            }
        } catch (error) {
            errors.push(`${entry.name}: ${(error as Error).message}`)
        }
    }
    const state = readInstallState()
    for (const [name, installed] of Object.entries(state.packages)) {
        try {
            const manifest = readManifest(name)
            if (manifest.version !== installed.version) throw new Error('installed version differs from package')
            for (const file of manifest.files) {
                const target = safeTarget(file.target)
                if (!fs.existsSync(target) || hashFile(target) !== file.sha256)
                    throw new Error(`installed file differs: ${file.target}`)
            }
        } catch (error) {
            errors.push(`${name}: ${(error as Error).message}`)
        }
    }
    return {
        ok: errors.length === 0,
        errors,
        packageCount: catalog.packages.length,
        installed: Object.keys(state.packages).sort(),
    }
}

function dependencyClosure(names: string[]) {
    const manifests = new Map<string, ModuleManifest>()
    const visit = (name: string) => {
        if (manifests.has(name)) return
        const manifest = readManifest(name)
        manifests.set(name, manifest)
        for (const dependency of manifest.dependencies.hard) visit(dependency)
    }
    for (const name of names) visit(name)
    return [...manifests.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function stronglyConnectedGroups(manifests: ModuleManifest[]) {
    const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
    const index = new Map<string, number>()
    const low = new Map<string, number>()
    const stack: string[] = []
    const onStack = new Set<string>()
    const groups: string[][] = []
    let next = 0
    const visit = (name: string) => {
        index.set(name, next)
        low.set(name, next++)
        stack.push(name)
        onStack.add(name)
        for (const dependency of byName.get(name)?.dependencies.hard ?? []) {
            if (!byName.has(dependency)) continue
            if (!index.has(dependency)) {
                visit(dependency)
                low.set(name, Math.min(low.get(name)!, low.get(dependency)!))
            } else if (onStack.has(dependency)) {
                low.set(name, Math.min(low.get(name)!, index.get(dependency)!))
            }
        }
        if (low.get(name) !== index.get(name)) return
        const group: string[] = []
        while (true) {
            const current = stack.pop()!
            onStack.delete(current)
            group.push(current)
            if (current === name) break
        }
        groups.push(group.sort())
    }
    for (const name of [...byName.keys()].sort()) if (!index.has(name)) visit(name)
    return groups.sort((left, right) => left[0]!.localeCompare(right[0]!))
}

function findModuleImports(files: string[]) {
    const dependencies = new Set<string>()
    for (const file of files.filter((file) => file.endsWith('.ts'))) {
        for (const target of importsFrom(path.join(projectRoot, file))) {
            const moduleName = moduleForPath(target)
            if (moduleName && packageNames.includes(moduleName as (typeof packageNames)[number]))
                dependencies.add(moduleName)
        }
    }
    return [...dependencies].sort()
}

function findIncomingReferences(name: string) {
    const references: string[] = []
    const packageFiles = new Set(archiveRecipes[name as keyof typeof archiveRecipes]?.files ?? [])
    for (const file of walk(sourceModulesRoot).filter((file) => file.endsWith('.ts'))) {
        if (file.startsWith(path.join(sourceModulesRoot, name) + path.sep)) continue
        if (packageFiles.has(relative(file))) continue
        if (importsFrom(file).some((target) => moduleForPath(target) === name)) references.push(relative(file))
    }
    return [...new Set(references)].sort()
}

function findMemberReferences(name: string) {
    const memberNames = new Set(archiveRecipes[name as keyof typeof archiveRecipes]?.memberNames ?? [name])
    const packageFiles = new Set(archiveRecipes[name as keyof typeof archiveRecipes]?.files ?? [])
    return walk(sourceModulesRoot)
        .filter((file) => file.endsWith('.ts'))
        .filter((file) => !file.startsWith(path.join(sourceModulesRoot, name) + path.sep))
        .filter((file) => !packageFiles.has(relative(file)))
        .filter((file) => hasMemberReference(file, memberNames))
        .map(relative)
        .sort()
}

function hasMemberReference(filePath: string, memberNames: Set<string>) {
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
    let found = false
    const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && memberNames.has(node.name.text)) found = true
        if (!found) ts.forEachChild(node, visit)
    }
    visit(source)
    return found
}

function importsFrom(sourcePath: string) {
    const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true)
    const targets: string[] = []
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const specifier = statement.moduleSpecifier.text
        if (!specifier.startsWith('.')) continue
        const base = path.resolve(path.dirname(sourcePath), specifier)
        const candidates = [base, `${base}.ts`, path.join(base, 'index.ts')]
        const target = candidates.find((candidate) => fs.existsSync(candidate))
        if (target) targets.push(target)
    }
    return targets
}

function configTablesIn(sourcePath: string) {
    return [...fs.readFileSync(sourcePath, 'utf8').matchAll(/\bC\.([A-Za-z_]\w*)\s*\(/g)].map((match) => match[1]!)
}

function moduleForPath(filePath: string) {
    const relativePath = path.relative(sourceModulesRoot, filePath)
    const [moduleName] = relativePath.split(path.sep)
    return moduleName
}

function copyIntoPayload(packageRoot: string, target: string): ManifestFile {
    const payload = path.join('payload', target).split(path.sep).join('/')
    const destination = path.join(packageRoot, payload)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(projectRoot, target), destination)
    return { target, payload, sha256: hashFile(destination) }
}

function updateCatalog(manifest: ModuleManifest) {
    const catalog = readCatalog()
    catalog.packages = catalog.packages.filter((entry) => entry.name !== manifest.name)
    catalog.packages.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        dependencies: manifest.dependencies.hard,
        packagePath: `${manifest.name}/manifest.json`,
    })
    catalog.packages.sort((left, right) => left.name.localeCompare(right.name))
    writeJson(catalogPath, catalog)
}

function validateManifest(manifest: ModuleManifest) {
    if (manifest.schemaVersion !== 1) throw new Error('unsupported manifest schema')
    ensurePackageName(manifest.name)
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('manifest version must be semver')
    if (
        !Array.isArray(manifest.files) ||
        !Array.isArray(manifest.integrations) ||
        !Array.isArray(manifest.configFragments)
    ) {
        throw new Error('invalid manifest arrays')
    }
    if (
        !manifest.dependencies ||
        !['base', 'hard', 'optional'].every((key) =>
            Array.isArray(manifest.dependencies[key as keyof typeof manifest.dependencies]),
        )
    ) {
        throw new Error('invalid manifest dependencies')
    }
    for (const file of manifest.files) {
        safeTarget(file.target)
        if (!/^payload\/.+/.test(file.payload) || !/^[a-f0-9]{64}$/.test(file.sha256))
            throw new Error(`invalid file mapping: ${file.target}`)
    }
}

function validateIntegration(integration: Integration) {
    if (!/^[a-z][A-Za-z0-9-]*$/.test(integration.id)) throw new Error(`invalid integration id: ${integration.id}`)
    safeTarget(integration.target)
    if (integration.type === 'addImport' && !integration.import.startsWith('import '))
        throw new Error(`invalid import: ${integration.id}`)
}

function validateConfigFragment(fragment: ConfigFragment) {
    safeTarget(fragment.target)
    if (!fragment.target.startsWith('config_game/') || !fragment.target.endsWith('.json'))
        throw new Error(`invalid config target: ${fragment.target}`)
}

function preflightIntegrations(integrations: Integration[]) {
    for (const integration of integrations) {
        const target = safeTarget(integration.target)
        if (!fs.existsSync(target)) throw new Error(`integration target is missing: ${integration.target}`)
        const text = fs.readFileSync(target, 'utf8')
        const expected = integration.type === 'addImport' ? integration.expectedAbsent : integration.expectedAbsent
        if (expected && text.includes(expected))
            throw new Error(`integration already exists or conflicts: ${integration.id}`)
        if (
            (integration.type === 'addStatement' || integration.type === 'insertAfterText') &&
            !text.includes(integration.after)
        )
            throw new Error(`integration anchor is missing: ${integration.id}`)
        if (
            (integration.type === 'addClassMember' || integration.type === 'addClassImplements') &&
            !findClass(target, integration.className)
        )
            throw new Error(`class is missing: ${integration.id}`)
        if (integration.type === 'addStatement' && !findFunction(target, integration.functionName))
            throw new Error(`function is missing: ${integration.id}`)
    }
}

function preflightConfigFragments(fragments: ConfigFragment[]) {
    for (const fragment of fragments) {
        const target = safeTarget(fragment.target)
        if (!fs.existsSync(target)) throw new Error(`config target is missing: ${fragment.target}`)
        const current = readJson<Record<string, unknown>>(target)
        for (const [key, value] of Object.entries(fragment.entries)) {
            if (key in current && JSON.stringify(current[key]) !== JSON.stringify(value)) {
                throw new Error(`config conflict: ${fragment.target}#${key}`)
            }
        }
    }
}

function applyIntegration(integration: Integration, remember: (target: string) => void) {
    const target = safeTarget(integration.target)
    const text = fs.readFileSync(target, 'utf8')
    let index: number
    let insert: string
    if (integration.type === 'addImport') {
        const source = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true)
        const imports = source.statements.filter(ts.isImportDeclaration)
        index = imports.length > 0 ? imports[imports.length - 1]!.end : 0
        insert = `${imports.length > 0 ? '\n' : ''}${integration.import}\n`
    } else if (integration.type === 'addClassMember') {
        const declaration = findClass(target, integration.className)!
        index = declaration.members.end
        insert = `\n    ${integration.member}\n`
    } else if (integration.type === 'addClassImplements') {
        const declaration = findClass(target, integration.className)!
        index = text.lastIndexOf('{', declaration.members.pos)
        if (index < declaration.getStart()) throw new Error(`class body is missing: ${integration.id}`)
        const header = text.slice(declaration.getStart(), index)
        insert = header.includes('implements')
            ? `, ${integration.implements}`
            : ` implements ${integration.implements} `
    } else if (integration.type === 'insertAfterText') {
        const after = text.indexOf(integration.after)
        index = after + integration.after.length
        insert = `\n${integration.text}`
    } else {
        const after = text.indexOf(integration.after)
        index = after + integration.after.length
        insert = `\n${integration.statement}`
    }
    remember(target)
    fs.writeFileSync(target, `${text.slice(0, index)}${insert}${text.slice(index)}`)
}

function applyConfigFragment(fragment: ConfigFragment, remember: (target: string) => void) {
    const target = safeTarget(fragment.target)
    const current = readJson<Record<string, unknown>>(target)
    let changed = false
    for (const [key, value] of Object.entries(fragment.entries)) {
        if (!(key in current)) {
            current[key] = value
            changed = true
        }
    }
    if (!changed) return
    remember(target)
    writeJson(target, current)
}

function findClass(filePath: string, className: string) {
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
    return source.statements.find(
        (statement): statement is ts.ClassDeclaration =>
            ts.isClassDeclaration(statement) && statement.name?.text === className,
    )
}

function findFunction(filePath: string, functionName: string) {
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
    let found = false
    const visit = (node: ts.Node): void => {
        if (ts.isMethodDeclaration(node) && node.name.getText(source) === functionName) found = true
        ts.forEachChild(node, visit)
    }
    visit(source)
    return found
}

function readInstallState(): InstallState {
    if (!fs.existsSync(statePath)) return { schemaVersion: 1, packages: {} }
    const state = readJson<InstallState>(statePath)
    if (state.schemaVersion !== 1 || !state.packages) throw new Error('invalid module-library install state')
    return state
}

function rollbackChanges(rollback: Map<string, Buffer | undefined>) {
    for (const [target, content] of [...rollback.entries()].reverse()) {
        if (content === undefined) fs.rmSync(target, { force: true })
        else fs.writeFileSync(target, content)
    }
}

function safeTarget(relativePath: string) {
    const target = path.resolve(projectRoot, relativePath)
    if (!target.startsWith(projectRoot + path.sep)) throw new Error(`path escapes project: ${relativePath}`)
    return target
}

function safePayload(name: string, file: ManifestFile) {
    const packageRoot = path.join(libraryRoot, name)
    const payload = path.resolve(packageRoot, file.payload)
    if (!payload.startsWith(packageRoot + path.sep)) throw new Error(`payload escapes package: ${file.payload}`)
    return payload
}

function readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function writeJson(filePath: string, value: unknown) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function walk(root: string): string[] {
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(root, entry.name)
        return entry.isDirectory() ? walk(entryPath) : [entryPath]
    })
}

function relative(filePath: string) {
    return path.relative(projectRoot, filePath).split(path.sep).join('/')
}

function hashFile(filePath: string) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function runOperation<T>(kind: 'add' | 'archive', names: string[], operation: () => T): T {
    const operationsRoot = path.join(libraryRoot, '.operations')
    const lockPath = path.join(libraryRoot, '.operation-lock')
    fs.mkdirSync(operationsRoot, { recursive: true })
    let descriptor: number
    try {
        descriptor = fs.openSync(lockPath, 'wx')
    } catch {
        throw new Error(`another module operation is active or interrupted: ${relative(lockPath)}`)
    }
    const operationId = `${Date.now()}-${process.pid}`
    const logPath = path.join(operationsRoot, `${operationId}.json`)
    const log = { schemaVersion: 1, operationId, kind, names, status: 'started', startedAt: new Date().toISOString() }
    fs.writeFileSync(descriptor, `${operationId}\n`)
    writeJson(logPath, log)
    try {
        const result = operation()
        writeJson(logPath, { ...log, status: 'completed', completedAt: new Date().toISOString() })
        return result
    } catch (error) {
        writeJson(logPath, {
            ...log,
            status: 'failed',
            failedAt: new Date().toISOString(),
            error: (error as Error).message,
        })
        throw error
    } finally {
        fs.closeSync(descriptor)
        fs.rmSync(lockPath, { force: true })
    }
}
