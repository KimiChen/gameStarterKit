import { BaseEntity } from '@arthropoda/typeorm'
import { AdjustAccountWhiteModel } from './AdjustAccountWhiteModel'
import { AdjustFuncCaseModel } from './AdjustFuncCaseModel'
import { AdjustPromptModel } from './AdjustPromptModel'
import { AdjustRobotBatchPlanModel } from './AdjustRobotBatchPlanModel'
import { AdjustRobotCaseModel } from './AdjustRobotCaseModel'
import { AdjustRobotEnvironmentModel } from './AdjustRobotEnvironmentModel'
import { AdjustRobotUserGroupModel } from './AdjustRobotUserGroupModel'
import { AdjustWstoolUserModel } from './AdjustWstoolUserModel'
import { CenterActivityModel } from './CenterActivityModel'
import { CenterGuildModel } from './CenterGuildModel'
import { CenterOrderModel } from './CenterOrderModel'
import { CenterUserModel } from './CenterUserModel'
import { DeviceWhiteModel } from './DeviceWhiteModel'
import { GamePackageModel } from './GamePackageModel'
import { GiftModel } from './GiftModel'
import { GlobalMailModel } from './GlobalMailModel'
import { GlobalMailTimingModel } from './GlobalMailTimingModel'
import { GmConfigModel } from './GmConfigModel'
import { GmLoginUserListModel } from './GmLoginUserListModel'
import { GonggaoGameModel } from './GonggaoGameModel'
import { GonggaoLoginModel } from './GonggaoLoginModel'
import { MailModel } from './MailModel'
import { MailRoleLogModel } from './MailRoleLogModel'
import { Migrations } from './Migrations'
import { ModuleConfModel } from './ModuleConfModel'
import { OpsUserModel } from './OpsUserModel'
import { ServerActivityModel } from './ServerActivityModel'
import { ServerListConfigModel } from './ServerListConfigModel'
import { ServerListModel } from './ServerListModel'
import { ServerSettingModel } from './ServerSettingModel'
import { ServerUserModel } from './ServerUserModel'
import { TestConfigModel } from './TestConfigModel'
import { UserForbidModel } from './UserForbidModel'
import { AdjustCaseModel } from '../../src/modules/adjust/persistence/AdjustCaseModel'
import { AdjustEnvModel } from '../../src/modules/adjust/persistence/AdjustEnvModel'
export const entities: (typeof BaseEntity)[] = [
    AdjustAccountWhiteModel,
    AdjustFuncCaseModel,
    AdjustPromptModel,
    AdjustRobotBatchPlanModel,
    AdjustRobotCaseModel,
    AdjustRobotEnvironmentModel,
    AdjustRobotUserGroupModel,
    AdjustWstoolUserModel,
    CenterActivityModel,
    CenterGuildModel,
    CenterOrderModel,
    CenterUserModel,
    DeviceWhiteModel,
    GamePackageModel,
    GiftModel,
    GlobalMailModel,
    GlobalMailTimingModel,
    GmConfigModel,
    GmLoginUserListModel,
    GonggaoGameModel,
    GonggaoLoginModel,
    MailModel,
    MailRoleLogModel,
    Migrations,
    ModuleConfModel,
    OpsUserModel,
    ServerActivityModel,
    ServerListConfigModel,
    ServerListModel,
    ServerSettingModel,
    ServerUserModel,
    TestConfigModel,
    UserForbidModel,
    AdjustCaseModel,
    AdjustEnvModel,
]
