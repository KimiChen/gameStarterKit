const assert = require('assert')
const fs = require('fs')
const path = require('path')

describe('key ownership', () => {
    const root = path.resolve(__dirname, '../..')

    it('keeps state keys with their feature owners', () => {
        const fightLogKeys = fs.existsSync(path.join(root, 'src/modules/fightLog/persistence/FightLogKeys.ts'))
            ? 'src/modules/fightLog/persistence/FightLogKeys.ts'
            : 'module-library/fightLog/payload/src/modules/fightLog/persistence/FightLogKeys.ts'
        const lodeKeys = fs.existsSync(path.join(root, 'src/modules/lode/persistence/LodeBattleRecordKeys.ts'))
            ? 'src/modules/lode/persistence/LodeBattleRecordKeys.ts'
            : 'module-library/lode/payload/src/modules/lode/persistence/LodeBattleRecordKeys.ts'
        const arenaKeys = fs.existsSync(path.join(root, 'src/modules/arena/persistence/ArenaBattleRecordKeys.ts'))
            ? 'src/modules/arena/persistence/ArenaBattleRecordKeys.ts'
            : 'module-library/arena/payload/src/modules/arena/persistence/ArenaBattleRecordKeys.ts'
        const contracts = {
            'src/modules/activity/rules/ActivityStateKeys.ts': {
                ActivityConf: 'ActivityConf',
                ActivitySyncTimeVer: 'ActivitySyncTimeVer',
                ActionActivityStageTaskLock: 'ActionActivityStageTaskLock',
            },
            'src/modules/chat/messaging/ChatMessageKeys.ts': {
                CHAT_LOG_MSG: 'chatLogMsg',
                CHAT_WORLD_KEY: 'chat:world',
                CHAT_GUILD_KEY: 'chat:guild:',
                CHAT_CROSS_ACTIVITY_KEY: 'chat:cross:activity:',
                CHAT_SYSTEM_KEY: 'chat:system',
                CHAT_FRIEND_KEY: 'chat:friend:',
            },
            'src/modules/mail/rules/MailStateKeys.ts': {
                MAIL_INCR_ID_KEY: 'mail_incr_id',
                LOCK_MAIL_CACHE_INIT: 'lock:global_mail_init',
            },
            [arenaKeys]: {
                ARENA_BATTLE_RECORDS: 'arena:battleRecords',
            },
            [lodeKeys]: {
                LODE_BATTLE_RECORDS: 'lode:battleRecords',
            },
            [fightLogKeys]: {
                FIGHT_LOG_KEY: 'fight_log:',
            },
            'src/modules/serverSettings/rules/ServerSettingsKeys.ts': {
                LOCK_RELOAD_SETTINGS: 'lock:reload_settings',
                LOCK_INCREMENT_SETTINGS: 'lock:increment_settings',
                GAME_USER_SERVERS: 'game.userServers:',
                CACHE_SETTING_MANAGER_VALUES: 'cache:setting_manager:values',
            },
            'src/modules/user/rules/UserAccountKeys.ts': {
                GAME_PUSH_TOKENS: 'game.pushTokens',
                USER_NAME_LOCK_KEY: 'usename_lock:',
            },
        }

        for (const [filePath, fields] of Object.entries(contracts)) {
            const source = fs.readFileSync(path.join(root, filePath), 'utf8')
            for (const [field, value] of Object.entries(fields)) {
                assert.match(source, new RegExp(`static readonly ${field} = '${value}'`))
            }
        }
    })

    it('keeps player power scoring owned by the user rules module', () => {
        const source = fs.readFileSync(path.join(root, 'src/modules/user/rules/PowerScoreRules.ts'), 'utf8')
        assert.match(source, /export class PowerScoreRules/)
        assert.match(source, /FP_TYPE_GONG = 1/)
        assert.match(source, /FP_TYPE_SOUL_SPECIAL = 19/)
    })
})
