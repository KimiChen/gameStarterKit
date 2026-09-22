import { ActionLogin } from '../../../../src/runtime/action/C2S/base/ActionLogin'
import { ActionDefault } from '../../../../src/runtime/action/C2S/default/ActionDefault'
import { ActionHeroRecruitBuy } from '../../../../src/modules/heroRecruit/action/ActionHeroRecruitBuy'
import { ActionHeroRecruitGetCatalog } from '../../../../src/modules/heroRecruit/action/ActionHeroRecruitGetCatalog'
import { ActionIncomeClaimOffline } from '../../../../src/modules/income/action/ActionIncomeClaimOffline'
import { ActionIncomeGetPending } from '../../../../src/modules/income/action/ActionIncomeGetPending'
import { ActionIncomeSettleOnline } from '../../../../src/modules/income/action/ActionIncomeSettleOnline'

export const Actions = {
    'base/Login': ActionLogin,
    'default/Default': ActionDefault,
    'heroRecruit.buy': ActionHeroRecruitBuy,
    'heroRecruit.getCatalog': ActionHeroRecruitGetCatalog,
    'income.claimOffline': ActionIncomeClaimOffline,
    'income.getPending': ActionIncomeGetPending,
    'income.settleOnline': ActionIncomeSettleOnline,
}
