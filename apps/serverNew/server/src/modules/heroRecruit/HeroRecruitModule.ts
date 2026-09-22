import { defineGameModule } from '../../startup/GameModule'

/** 英雄招募路由完全由 shared schema 生成的 Action 承载。 */
export const HeroRecruitModule = defineGameModule({
    name: 'heroRecruit',
    schemaOnly: true,
})
