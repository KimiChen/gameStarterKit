import { defineGameModule } from '../../startup/GameModule'
import { ApiChangeAction } from './api/ApiChangeAction'
import { AdjustConfigLoader } from './config/AdjustConfigLoader'
import { AdjustAccessMiddleware } from './http/AdjustAccessMiddleware'
import { AdjustApiController } from './http/AdjustApiController'
import { AdjustController } from './http/AdjustController'
import { ConfigController } from './http/config/ConfigController'
import { AccountWhiteController } from './http/accountWhite.controller'
import { AdjustAiController } from './http/ai/AdjustAiController'
import { CustomFunctionController } from './http/CustomFunctionController'
import { FuncCaseController } from './http/FuncCaseController'
import { RobotBatchPlanController } from './http/robot/RobotBatchPlanController'
import { RobotCaseController } from './http/robot/RobotCaseController'
import { RobotEnvironmentController } from './http/robot/RobotEnvironmentController'
import { RobotUserGroupController } from './http/robot/RobotUserGroupController'
import { AdjustCaseController } from './http/AdjustCaseController'
import { AdjustEnvController } from './http/AdjustEnvController'

export const AdjustModule = defineGameModule({
    name: 'adjust',
    protocol: {
        actionExecutors: [
            {
                kind: 'actionExecutor',
                name: 'adjust-action-executor',
                app: 'all',
                executor: ApiChangeAction.execAction,
            },
        ],
        internalJsonActions: [
            {
                kind: 'internalJsonAction',
                name: 'adjust-json-action',
                app: 'all',
                key: 'adjust',
                handler: ApiChangeAction.execAction,
            },
        ],
    },
    managementHttp: {
        controllers: [
            { kind: 'controller', name: 'adjust-controller', app: 'management', controller: AdjustController },
            {
                kind: 'controller',
                name: 'adjust-api-controller',
                app: 'management',
                after: ['adjust-controller'],
                controller: AdjustApiController,
            },
            {
                kind: 'controller',
                name: 'adjust-config-controller',
                app: 'management',
                after: ['adjust-api-controller'],
                controller: ConfigController,
            },
            {
                kind: 'controller',
                name: 'adjust-custom-function-controller',
                app: 'management',
                after: ['adjust-config-controller'],
                controller: CustomFunctionController,
            },
            {
                kind: 'controller',
                name: 'adjust-ai-controller',
                app: 'management',
                after: ['adjust-custom-function-controller'],
                controller: AdjustAiController,
            },
            {
                kind: 'controller',
                name: 'adjust-account-white-controller',
                app: 'management',
                after: ['adjust-ai-controller'],
                controller: AccountWhiteController,
            },
            {
                kind: 'controller',
                name: 'adjust-func-case-controller',
                app: 'management',
                after: ['adjust-account-white-controller'],
                controller: FuncCaseController,
            },
            {
                kind: 'controller',
                name: 'adjust-robot-batch-plan-controller',
                app: 'management',
                after: ['adjust-func-case-controller'],
                controller: RobotBatchPlanController,
            },
            {
                kind: 'controller',
                name: 'adjust-robot-case-controller',
                app: 'management',
                after: ['adjust-robot-batch-plan-controller'],
                controller: RobotCaseController,
            },
            {
                kind: 'controller',
                name: 'adjust-robot-environment-controller',
                app: 'management',
                after: ['adjust-robot-case-controller'],
                controller: RobotEnvironmentController,
            },
            {
                kind: 'controller',
                name: 'adjust-robot-user-group-controller',
                app: 'management',
                after: ['adjust-robot-environment-controller'],
                controller: RobotUserGroupController,
            },
            {
                kind: 'controller',
                name: 'adjust-case-controller',
                app: 'management',
                after: ['adjust-robot-user-group-controller'],
                controller: AdjustCaseController,
            },
            {
                kind: 'controller',
                name: 'adjust-env-controller',
                app: 'management',
                after: ['adjust-case-controller'],
                controller: AdjustEnvController,
            },
        ],
        middlewares: [
            {
                kind: 'middleware',
                name: 'adjust-access-middleware',
                app: 'management',
                middleware: AdjustAccessMiddleware,
            },
        ],
    },
    startup: [
        {
            name: 'load-adjust-test-config',
            app: 'service',
            phase: 'persistence-ready',
            scope: 'process',
            run: () => AdjustConfigLoader.loadAllTestConfig(),
        },
    ],
})
