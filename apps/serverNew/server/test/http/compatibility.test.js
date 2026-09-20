const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const root = path.resolve(__dirname, '../..')

describe('management HTTP compatibility', () => {
    const contract = captureManagementHttpContract()

    it('registers every generated controller exactly once with resolvable dependencies', () => {
        const catalog = JSON.parse(readProjectFile('generated/modules/module-catalog.json'))
        const registered = catalog.systems.managementHttp
            .filter((entry) => entry.contribution.kind === 'controller')
            .map((entry) => entry.contribution.controller)

        assert.deepStrictEqual(contract.controllerOrder, registered)
        assert.strictEqual(new Set(contract.controllerOrder).size, contract.controllerOrder.length)
        for (const controller of contract.controllerOrder) {
            assert.ok(Array.isArray(contract.dependencies[controller]), `missing dependencies: ${controller}`)
            assert.ok(Array.isArray(contract.middlewares[controller]), `missing middleware metadata: ${controller}`)
        }
    })

    it('keeps routes, request metadata, and Swagger summaries stable', () => {
        const establishedControllers = new Set([
            'AdjustController',
            'AdjustApiController',
            'ConfigController',
            'CenterController',
            'ClientController',
            'ClientConfigController',
            'ErrorLogController',
            'GmController',
            'OrderController',
            'PayController',
        ])
        assert.deepStrictEqual(
            contract.routes.filter((item) => establishedControllers.has(item.controller)),
            [
                route('AdjustController', 'GET', '/adjust/domain', 'domain', '', '获取线路列表'),
                route(
                    'AdjustController',
                    'POST',
                    '/adjust/getCustomFunction',
                    'getCustomFunction',
                    "uId:int@QueryParam('uId')|body:AdjustGetCustomBody@Body()",
                    '获取自定义功能',
                ),
                route(
                    'AdjustController',
                    'GET',
                    '/adjust/get',
                    'getData',
                    "uId:int@QueryParam('uId')|request:ExpressRequest@Req()",
                    '获取数据修改节点',
                ),
                route(
                    'AdjustController',
                    'POST',
                    '/adjust/parseCommitAction',
                    'parseCommitAction',
                    "uId:int@QueryParam('uId')|body:ParseCommitActionBody@Body()",
                    '解析提交操作',
                ),
                route(
                    'AdjustController',
                    'GET',
                    '/adjust/newUser',
                    'newUser',
                    'querys:NewUserQuery@QueryParams()',
                    '创建新角色',
                ),
                route(
                    'AdjustController',
                    'GET',
                    '/adjust/userInfo',
                    'userInfo',
                    "uId:int@QueryParam('uId')",
                    '查询玩家信息',
                ),
                route(
                    'AdjustController',
                    'GET',
                    '/adjust/getHash',
                    'getHash',
                    "uId:int@QueryParam('uId')|request:ExpressRequest@Req()",
                    '获取玩家的hashKey',
                ),
                route('AdjustController', 'GET', '/adjust/time', 'time', '', '获取当前服务器时间'),
                route('AdjustController', 'GET', '/adjust/getServer', 'getServer', '', '获取区服信息列表'),
                route(
                    'AdjustController',
                    'GET',
                    '/adjust/wstool/config',
                    'quickMenuConfig',
                    'request:ExpressRequest@Req()',
                    '获取网页调试工具快捷入口',
                ),
                route(
                    'AdjustApiController',
                    'POST',
                    '/adjust/api/change',
                    'adjustApiChange',
                    'data:AdjustApiChangeBody@Body({ validate: true })',
                    '修改服务器时间',
                ),
                route('ConfigController', 'GET', '/config/all', 'all', 'req:ExpressRequest@Req()', '获取全部游戏配置'),
                route('ConfigController', 'POST', '/config/history', 'history', '', '配置热更历史'),
                route('ConfigController', 'GET', '/config/getSelect', 'getSelect', '', '获取可用区服'),
                route(
                    'ConfigController',
                    'POST',
                    '/config/upload',
                    'upload',
                    "file:any@UploadedFile('up_file_0', { options: { storage: adjustConfigUploadStorage } })|data:{ server_id: string }@Body()",
                    '上传配置',
                ),
                route(
                    'ConfigController',
                    'POST',
                    '/config/delete',
                    'delete',
                    'body:{ ids: string }@Body()',
                    '删除配置',
                ),
                route(
                    'ConfigController',
                    'GET',
                    '/configshow',
                    'configShow',
                    "query:{ id: string }@QueryParam('id')",
                    '查看配置',
                ),
                route(
                    'CenterController',
                    'GET',
                    '/center/login',
                    'login',
                    'query:UserLoginQuery@QueryParams()|req:Request@Req()',
                    '玩家登录',
                ),
                route(
                    'CenterController',
                    'GET',
                    '/center/gmLogin',
                    'gmLogin',
                    'query:UserLoginQuery@QueryParams()|req:Request@Req()',
                    'GM玩家登录',
                ),
                route('CenterController', 'GET', '/center/gongGaoList', 'getGongGaoList', '', '获取游戏公告列表'),
                route(
                    'CenterController',
                    'GET',
                    '/center/packageVersion',
                    'packageVersion',
                    'query:PackageVersionQuery@QueryParams()|res:Response@Res()',
                    '包管理请求',
                ),
                route(
                    'ClientController',
                    'GET',
                    '/client/download',
                    'downloadTempConfig',
                    'query:DownloadQuery@QueryParams()|res:Response@Res()',
                    '下载测试上传的临时配置文件',
                ),
                route(
                    'ClientController',
                    'GET',
                    '/client/downloadConf',
                    'downloadConfig',
                    "name:string@QueryParam('name')|res:Response@Res()",
                    '下载配置文件',
                ),
                route(
                    'ClientConfigController',
                    'GET',
                    '/clientConfig/listOld',
                    'getClientConfList',
                    "sId:int@QueryParam('sId')",
                    '可热更的配置列表',
                ),
                route(
                    'ClientConfigController',
                    'GET',
                    '/clientConfig/list',
                    'getClientConfListNew',
                    "sId:int@QueryParam('sId')",
                    '可热更的配置列表',
                ),
                route(
                    'ClientConfigController',
                    'GET',
                    '/clientConfig/configZip',
                    'getZipFiles',
                    'query:ConfigZipQuery@QueryParams()|res:Response',
                    '打包发生客户端获取的json文件列表',
                ),
                route(
                    'ErrorLogController',
                    'GET',
                    '/exception/info',
                    'info',
                    "p_data:string@QueryParam('data')|req:Request@Req()|res:Response@Res()",
                    '查看错误日志',
                ),
                route('GmController', 'POST', '/gm/api', 'doApi', 'req:Request@Req()', 'gmDoApi入口'),
                route('GmController', 'GET', '/gm/api', 'doApi', 'req:Request@Req()', 'gmDoApi入口'),
                route(
                    'OrderController',
                    'GET',
                    '/order/create/:sdk',
                    'orderCreate',
                    "sdk:string@Param('sdk')|query:OrderCreateReq@QueryParams()",
                    '支付下单接口',
                ),
                route(
                    'OrderController',
                    'POST',
                    '/order/create/:sdk',
                    'orderCreate',
                    "sdk:string@Param('sdk')|query:OrderCreateReq@QueryParams()",
                    '支付下单接口',
                ),
                route(
                    'PayController',
                    'GET',
                    '/pay/:sdk',
                    'payCallback',
                    "sdk:string@QueryParam('sdk')|req:Request@Req()",
                    '支付回调',
                ),
                route(
                    'PayController',
                    'POST',
                    '/pay/:sdk',
                    'payCallback',
                    "sdk:string@QueryParam('sdk')|req:Request@Req()",
                    '支付回调',
                ),
            ],
        )

        const featureRoutes = new Set(contract.routes.map((item) => `${item.controller}:${item.verb} ${item.path}`))
        for (const routeKey of [
            'CustomFunctionController:POST /adjust/customFunc/commit',
            'AdjustAiController:POST /adjust/ai-code/read',
            'AccountWhiteController:POST /adjust/account/white/add',
            'FuncCaseController:POST /adjust/func-case/reorder',
            'RobotBatchPlanController:POST /adjust/multipleCase/import',
            'RobotCaseController:POST /adjust/case/edit',
            'RobotEnvironmentController:POST /adjust/env/edit',
            'RobotUserGroupController:POST /adjust/userGroup/edit',
            'SsoController:POST /center/ssoLogin',
        ]) {
            assert.ok(featureRoutes.has(routeKey), `missing feature route: ${routeKey}`)
        }
    })

    it('keeps the HTTP framework boundary free of feature implementations', () => {
        const frameworkFiles = walkTypeScriptFiles(path.join(root, 'src/http')).map((filePath) =>
            path.relative(root, filePath).replaceAll(path.sep, '/'),
        )
        for (const filePath of frameworkFiles) {
            assert.ok(
                [
                    'src/http/app.ts',
                    'src/http/main.ts',
                    'src/http/swagger.ts',
                    'src/http/initializeManagementHttp.ts',
                    'src/http/FixedServerEndpoint.ts',
                ].includes(filePath) ||
                    filePath.startsWith('src/http/config/') ||
                    filePath.startsWith('src/http/constants/') ||
                    filePath.startsWith('src/http/middlewares/') ||
                    filePath.startsWith('src/http/security/'),
                `feature implementation remains in HTTP framework: ${filePath}`,
            )
        }
    })

    it('uses the shared current-config migration runner during startup', () => {
        const startup = readProjectFile('src/http/initializeManagementHttp.ts')
        const migration = readProjectFile('migration/modify_adjust_case_name_scope_1784419201000.ts')

        assert.match(startup, /await ensureDatabaseMigrations\(\)/)
        assert.doesNotMatch(startup, /mysql-tool|config_platform|execSync/)
        assert.match(migration, /names\.has\('uniq_adjust_case_parent_name'\)/)
        assert.match(migration, /names\.has\('uniq_adjust_case_name'\)/)
    })

    it('keeps feature-specific authorization behavior explicit', () => {
        const app = readProjectFile('src/http/app.ts')
        const adjust = readProjectFile('src/modules/adjust/http/AdjustAccessMiddleware.ts')
        const gm = readProjectFile('src/modules/gm/http/GmRequestDispatcher.ts')
        const diagnostics = readProjectFile('src/modules/diagnostics/http/ErrorLogController.ts')

        assert.match(app, /authorizationChecker:\s*undefined/)
        assert.match(adjust, /isOpenIps\(reqIp\)/)
        assert.match(adjust, /sendStatus\(404\)/)
        assert.match(gm, /WhiteIp\.checkWhiteIPList/)
        assert.match(gm, /checkSign\(CP\.platform\.gmSecret/)
        assert.match(gm, /queryParams\.requestId/)
        assert.match(diagnostics, /isOpenIps\(reqIp\)/)
        assert.match(diagnostics, /repeatRequestNum > 1/)
    })
})

function route(controller, verb, routePath, method, parameters, summary) {
    return { controller, verb, path: routePath, method, parameters, summary }
}

function captureManagementHttpContract() {
    const catalog = JSON.parse(readProjectFile('generated/modules/module-catalog.json'))
    const entries = catalog.systems.managementHttp.filter((entry) => entry.contribution.kind === 'controller')
    const controllerOrder = []
    const imports = new Map()
    for (const entry of entries) {
        const modulePath = path.join(root, entry.source)
        const moduleSource = parse(modulePath)
        const moduleImports = captureImports(modulePath, moduleSource)
        const controllerName = entry.contribution.controller
        controllerOrder.push(controllerName)
        imports.set(controllerName, moduleImports.get(controllerName))
    }

    const dependencies = {}
    const middlewares = {}
    const routes = []
    for (const controllerName of controllerOrder) {
        const filePath = imports.get(controllerName)
        assert.ok(filePath, `missing controller import: ${controllerName}`)
        const sourceFile = parse(filePath)
        const controller = sourceFile.statements.find(
            (statement) => ts.isClassDeclaration(statement) && statement.name?.text === controllerName,
        )
        assert.ok(controller, `missing controller class: ${controllerName}`)

        const controllerDecorators = decorators(controller)
        const prefixDecorator = controllerDecorators.find((decorator) => decoratorName(decorator) === 'JsonController')
        const prefix = decoratorStringArgument(prefixDecorator) ?? ''
        middlewares[controllerName] = controllerDecorators
            .filter((decorator) => decoratorName(decorator) === 'UseBefore')
            .map(decoratorText)

        const constructor = controller.members.find(ts.isConstructorDeclaration)
        dependencies[controllerName] = constructor
            ? constructor.parameters.map((parameter) => parameter.type?.getText(sourceFile) ?? '')
            : []

        for (const member of controller.members.filter(ts.isMethodDeclaration)) {
            const methodDecorators = decorators(member)
            const routeDecorators = methodDecorators.filter((decorator) =>
                ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(decoratorName(decorator)),
            )
            if (routeDecorators.length === 0) continue

            const summaryDecorator = methodDecorators.find((decorator) => decoratorName(decorator) === 'OpenAPI')
            const summary =
                summaryDecorator?.expression.getText(sourceFile).match(/summary:\s*['"]([^'"]*)['"]/)?.[1] ?? ''
            const parameters = member.parameters
                .map((parameter) => {
                    const parameterDecorators = decorators(parameter).map(decoratorText)
                    const suffix = parameterDecorators.length > 0 ? `@${parameterDecorators.join('@')}` : ''
                    return `${parameter.name.getText(sourceFile)}:${parameter.type?.getText(sourceFile) ?? ''}${suffix}`
                })
                .join('|')

            for (const routeDecorator of routeDecorators) {
                routes.push(
                    route(
                        controllerName,
                        decoratorName(routeDecorator).toUpperCase(),
                        prefix + (decoratorStringArgument(routeDecorator) ?? ''),
                        member.name.getText(sourceFile),
                        parameters,
                        summary,
                    ),
                )
            }
        }
    }
    return { controllerOrder, dependencies, middlewares, routes }
}

function captureImports(sourcePath, sourceFile) {
    const imports = new Map()
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        for (const binding of bindings.elements) {
            imports.set(binding.name.text, resolveImport(sourcePath, statement.moduleSpecifier.text))
        }
    }
    return imports
}

function captureArrayProperty(sourceFile, propertyName) {
    let elements
    visit(sourceFile, (node) => {
        const isProperty = ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)
        if (!isProperty || node.name.getText(sourceFile) !== propertyName || !node.initializer) return
        const initializer = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer
        if (initializer && ts.isArrayLiteralExpression(initializer)) {
            elements = initializer.elements.map((element) => element.getText(sourceFile))
        }
    })
    assert.ok(elements, `missing array property: ${propertyName}`)
    return elements
}

function parse(filePath) {
    return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
}

function decorators(node) {
    return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []
}

function decoratorName(decorator) {
    const expression = decorator.expression
    return ts.isCallExpression(expression) ? expression.expression.getText() : expression.getText()
}

function decoratorText(decorator) {
    return decorator.expression.getText().replace(/\s+/g, ' ')
}

function decoratorStringArgument(decorator) {
    if (!decorator || !ts.isCallExpression(decorator.expression)) return undefined
    const argument = decorator.expression.arguments[0]
    return argument && ts.isStringLiteral(argument) ? argument.text : undefined
}

function resolveImport(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier)
    for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) return candidate
    }
    return undefined
}

function visit(node, callback) {
    callback(node)
    node.forEachChild((child) => visit(child, callback))
}

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function walkTypeScriptFiles(directory) {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name)
        if (entry.isDirectory()) return walkTypeScriptFiles(filePath)
        return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : []
    })
}
