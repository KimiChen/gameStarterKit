import { Body, Get, JsonController, Post, QueryParam, Req, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { AdjustAiRequest, auditAi, digestAiValue, getAdjustAiPolicy } from './aiPolicy'
import { deletePrompt, readPrompts, writePrompt } from './aiPrompt'
import { getAiCodeContextConfig, grepAiCodeContext, listAiCodeContext, readAiCodeContext } from './aiCodeContext'
import { getAllGameConfigSchema, getBusinessKnowledge, getDiffInformation, getSourceKnowledge } from './aiKnowledge'

function success(data: unknown) {
    return { status: 0, msg: '操作成功', data }
}

function fail(error: unknown) {
    return { status: 1, s: 1, msg: error instanceof Error ? error.message : String(error), data: [] }
}

@JsonController('/adjust')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AdjustAiController {
    @Get('/ai/config')
    config(@Req() req: AdjustAiRequest) {
        const policy = getAdjustAiPolicy()
        const isGameLine = CP.platform.adjustSso?.isGameLine === true
        const canWrite = !isGameLine || req.adjustSsoUser?.isAdmin === true
        const codeConfig = getAiCodeContextConfig()
        return success({
            enabled: policy.enabled,
            features: {
                projectMemory: policy.projectMemory,
                experienceCases: policy.experienceCases,
                customSkills: policy.customSkills,
                businessKnowledge: policy.businessKnowledge,
                logicKnowledge: policy.logicKnowledge,
                diffInfo: policy.diffInfo,
                gameConfig: policy.gameConfig,
                redis: policy.redis,
                redisWrite: policy.redisWrite && canWrite,
                customFunction: policy.customFunction,
                mockClient: policy.mockClient && canWrite,
                serverCodeContext: policy.serverCodeContext,
            },
            permissions: {
                promptWrite: policy.promptWrite && canWrite,
                providerConfigWrite: policy.providerConfigWrite && canWrite,
                toolWrite: canWrite,
            },
            codeMounts: codeConfig.mounts,
        })
    }

    @Get('/readPrompts')
    readPrompts(@QueryParam('type') type: string, @Req() req: AdjustAiRequest) {
        return readPrompts(type, req)
    }

    @Post('/writePrompts')
    writePrompts(@Body() body: any, @Req() req: AdjustAiRequest) {
        return writePrompt(body, req)
    }

    @Post('/deletePrompts')
    deletePrompts(@Body() body: any, @Req() req: AdjustAiRequest) {
        return deletePrompt(body, req)
    }

    @Get('/agentUseDiffInfo')
    diffInfo(@Req() req: AdjustAiRequest) {
        const startedAt = Date.now()
        try {
            const policy = getAdjustAiPolicy()
            if (!policy.enabled || !policy.diffInfo) return fail('当前线路未开启 Diff 信息')
            const data = getDiffInformation()
            auditAi(req, {
                action: 'diff_info',
                resultCount: Object.keys(data).length,
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            auditAi(req, { action: 'diff_info', durationMs: Date.now() - startedAt }, error)
            return fail(error)
        }
    }

    @Get('/agentUseKnowledgeBase')
    businessKnowledge(@Req() req: AdjustAiRequest) {
        const startedAt = Date.now()
        try {
            const policy = getAdjustAiPolicy()
            if (!policy.enabled || !policy.businessKnowledge) return fail('当前线路未开启业务知识库')
            const data = getBusinessKnowledge()
            auditAi(req, {
                action: 'business_knowledge',
                resultCount: data.documents.length,
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            auditAi(req, { action: 'business_knowledge', durationMs: Date.now() - startedAt }, error)
            return fail(error)
        }
    }

    @Get('/agentUseLogicKb')
    logicKnowledge(@Req() req: AdjustAiRequest, @QueryParam('summaryOnly') summaryOnly: number = 0) {
        const startedAt = Date.now()
        try {
            const policy = getAdjustAiPolicy()
            if (!policy.enabled || !policy.logicKnowledge) return fail('当前线路未开启逻辑知识库')
            const data = getSourceKnowledge()
            const responseData =
                Number(summaryOnly) === 1
                    ? {
                          ...data,
                          modules: data.modules.map((module: any) => {
                              const item = { ...module }
                              delete item.files
                              return item
                          }),
                      }
                    : data
            auditAi(req, {
                action: 'logic_knowledge',
                summaryOnly: Number(summaryOnly) === 1,
                resultCount: data.modules.length,
                durationMs: Date.now() - startedAt,
            })
            return success(responseData)
        } catch (error) {
            auditAi(req, { action: 'logic_knowledge', durationMs: Date.now() - startedAt }, error)
            return fail(error)
        }
    }

    @Get('/getAllConfigSchema')
    configSchema(@Req() req: AdjustAiRequest) {
        const startedAt = Date.now()
        try {
            const policy = getAdjustAiPolicy()
            if (!policy.enabled || !policy.gameConfig) return fail('当前线路未开启游戏配置上下文')
            const data = getAllGameConfigSchema()
            auditAi(req, {
                action: 'game_config_schema',
                resultCount: Object.keys(data).length,
                durationMs: Date.now() - startedAt,
            })
            return success(data)
        } catch (error) {
            auditAi(req, { action: 'game_config_schema', durationMs: Date.now() - startedAt }, error)
            return fail(error)
        }
    }

    @Get('/ai-code/config')
    codeConfig() {
        const config = getAiCodeContextConfig()
        return { s: 0, ...config }
    }

    @Post('/ai-code/list')
    codeList(@Body() body: { scope?: string; path?: string }, @Req() req: AdjustAiRequest) {
        const startedAt = Date.now()
        try {
            if (!getAdjustAiPolicy().serverCodeContext) return fail('当前线路未开启服务端代码上下文')
            const data = listAiCodeContext(String(body?.scope || ''), String(body?.path || ''))
            auditAi(req, {
                action: 'code_list',
                scope: body?.scope || '',
                pathDigest: digestAiValue(body?.path),
                resultCount: data.items.length,
                durationMs: Date.now() - startedAt,
            })
            return { s: 0, data }
        } catch (error) {
            auditAi(
                req,
                {
                    action: 'code_list',
                    scope: body?.scope || '',
                    pathDigest: digestAiValue(body?.path),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            return fail(error)
        }
    }

    @Post('/ai-code/read')
    codeRead(
        @Body() body: { scope?: string; path?: string; startLine?: number; endLine?: number },
        @Req() req: AdjustAiRequest,
    ) {
        const startedAt = Date.now()
        try {
            if (!getAdjustAiPolicy().serverCodeContext) return fail('当前线路未开启服务端代码上下文')
            const data = readAiCodeContext(
                String(body?.scope || ''),
                String(body?.path || ''),
                Number(body?.startLine || 1),
                Number(body?.endLine || 100),
            )
            auditAi(req, {
                action: 'code_read',
                scope: body?.scope || '',
                pathDigest: digestAiValue(body?.path),
                startLine: data.startLine,
                endLine: data.endLine,
                durationMs: Date.now() - startedAt,
            })
            return { s: 0, data }
        } catch (error) {
            auditAi(
                req,
                {
                    action: 'code_read',
                    scope: body?.scope || '',
                    pathDigest: digestAiValue(body?.path),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            return fail(error)
        }
    }

    @Post('/ai-code/grep')
    codeGrep(@Body() body: { scope?: string; path?: string; pattern?: string }, @Req() req: AdjustAiRequest) {
        const startedAt = Date.now()
        try {
            if (!getAdjustAiPolicy().serverCodeContext) return fail('当前线路未开启服务端代码上下文')
            const data = grepAiCodeContext(
                String(body?.scope || ''),
                String(body?.path || ''),
                String(body?.pattern || ''),
            )
            auditAi(req, {
                action: 'code_grep',
                scope: body?.scope || '',
                pathDigest: digestAiValue(body?.path),
                patternDigest: digestAiValue(body?.pattern),
                resultCount: data.items.length,
                durationMs: Date.now() - startedAt,
            })
            return { s: 0, data }
        } catch (error) {
            auditAi(
                req,
                {
                    action: 'code_grep',
                    scope: body?.scope || '',
                    pathDigest: digestAiValue(body?.path),
                    patternDigest: digestAiValue(body?.pattern),
                    durationMs: Date.now() - startedAt,
                },
                error,
            )
            return fail(error)
        }
    }
}
