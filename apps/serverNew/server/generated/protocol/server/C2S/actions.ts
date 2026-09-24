import { ActionLogin } from '../../../../src/runtime/action/C2S/base/ActionLogin'
import { ActionDefault } from '../../../../src/runtime/action/C2S/default/ActionDefault'
import { ActionGameDemoAlchemyGet } from '../../../../src/modules/gameDemo/action/ActionGameDemoAlchemyGet'
import { ActionGameDemoAlchemyStart } from '../../../../src/modules/gameDemo/action/ActionGameDemoAlchemyStart'
import { ActionGameDemoAssets } from '../../../../src/modules/gameDemo/action/ActionGameDemoAssets'
import { ActionGameDemoBossAttack } from '../../../../src/modules/gameDemo/action/ActionGameDemoBossAttack'
import { ActionGameDemoBossEnter } from '../../../../src/modules/gameDemo/action/ActionGameDemoBossEnter'
import { ActionGameDemoBossGet } from '../../../../src/modules/gameDemo/action/ActionGameDemoBossGet'
import { ActionGameDemoBossLeave } from '../../../../src/modules/gameDemo/action/ActionGameDemoBossLeave'
import { ActionGameDemoBossList } from '../../../../src/modules/gameDemo/action/ActionGameDemoBossList'
import { ActionGameDemoBuy } from '../../../../src/modules/gameDemo/action/ActionGameDemoBuy'
import { ActionGameDemoGuildCreate } from '../../../../src/modules/gameDemo/action/ActionGameDemoGuildCreate'
import { ActionGameDemoGuildGet } from '../../../../src/modules/gameDemo/action/ActionGameDemoGuildGet'
import { ActionGameDemoGuildInvite } from '../../../../src/modules/gameDemo/action/ActionGameDemoGuildInvite'
import { ActionGameDemoGuildLeave } from '../../../../src/modules/gameDemo/action/ActionGameDemoGuildLeave'
import { ActionGameDemoGuildRespond } from '../../../../src/modules/gameDemo/action/ActionGameDemoGuildRespond'
import { ActionGameDemoHeroGet } from '../../../../src/modules/gameDemo/action/ActionGameDemoHeroGet'
import { ActionGameDemoHeroUpgrade } from '../../../../src/modules/gameDemo/action/ActionGameDemoHeroUpgrade'
import { ActionGameDemoInitialize } from '../../../../src/modules/gameDemo/action/ActionGameDemoInitialize'
import { ActionGameDemoMailClaim } from '../../../../src/modules/gameDemo/action/ActionGameDemoMailClaim'
import { ActionGameDemoMailList } from '../../../../src/modules/gameDemo/action/ActionGameDemoMailList'
import { ActionGameDemoMailRead } from '../../../../src/modules/gameDemo/action/ActionGameDemoMailRead'
import { ActionGameDemoSeasonEnd } from '../../../../src/modules/gameDemo/action/ActionGameDemoSeasonEnd'
import { ActionGameDemoSeasonGet } from '../../../../src/modules/gameDemo/action/ActionGameDemoSeasonGet'
import { ActionGameDemoShop } from '../../../../src/modules/gameDemo/action/ActionGameDemoShop'
import { ActionHeroRecruitBuy } from '../../../../src/modules/heroRecruit/action/ActionHeroRecruitBuy'
import { ActionHeroRecruitGetCatalog } from '../../../../src/modules/heroRecruit/action/ActionHeroRecruitGetCatalog'
import { ActionIncomeClaimOffline } from '../../../../src/modules/income/action/ActionIncomeClaimOffline'
import { ActionIncomeGetPending } from '../../../../src/modules/income/action/ActionIncomeGetPending'
import { ActionIncomeSettleOnline } from '../../../../src/modules/income/action/ActionIncomeSettleOnline'

export const Actions = {
    'base/Login': ActionLogin,
    'default/Default': ActionDefault,
    'gameDemo.alchemyGet': ActionGameDemoAlchemyGet,
    'gameDemo.alchemyStart': ActionGameDemoAlchemyStart,
    'gameDemo.assets': ActionGameDemoAssets,
    'gameDemo.bossAttack': ActionGameDemoBossAttack,
    'gameDemo.bossEnter': ActionGameDemoBossEnter,
    'gameDemo.bossGet': ActionGameDemoBossGet,
    'gameDemo.bossLeave': ActionGameDemoBossLeave,
    'gameDemo.bossList': ActionGameDemoBossList,
    'gameDemo.buy': ActionGameDemoBuy,
    'gameDemo.guildCreate': ActionGameDemoGuildCreate,
    'gameDemo.guildGet': ActionGameDemoGuildGet,
    'gameDemo.guildInvite': ActionGameDemoGuildInvite,
    'gameDemo.guildLeave': ActionGameDemoGuildLeave,
    'gameDemo.guildRespond': ActionGameDemoGuildRespond,
    'gameDemo.heroGet': ActionGameDemoHeroGet,
    'gameDemo.heroUpgrade': ActionGameDemoHeroUpgrade,
    'gameDemo.initialize': ActionGameDemoInitialize,
    'gameDemo.mailClaim': ActionGameDemoMailClaim,
    'gameDemo.mailList': ActionGameDemoMailList,
    'gameDemo.mailRead': ActionGameDemoMailRead,
    'gameDemo.seasonEnd': ActionGameDemoSeasonEnd,
    'gameDemo.seasonGet': ActionGameDemoSeasonGet,
    'gameDemo.shop': ActionGameDemoShop,
    'heroRecruit.buy': ActionHeroRecruitBuy,
    'heroRecruit.getCatalog': ActionHeroRecruitGetCatalog,
    'income.claimOffline': ActionIncomeClaimOffline,
    'income.getPending': ActionIncomeGetPending,
    'income.settleOnline': ActionIncomeSettleOnline,
}
