import { routingControllersToSpec } from 'routing-controllers-openapi'
import * as swaggerUiExpress from 'swagger-ui-express'
import { validationMetadatasToSchemas } from 'class-validator-jsonschema'
// import { name, description, version } from '../../package.json'

/**
 * 生成 Swagger 文档的函数
 * @param getMetadataArgsStorage - 获取元数据参数存储的函数
 * @param routingControllersOptions - 路由控制器的选项
 * @param app - Express 应用程序实例
 * @returns void
 */
export function buildSwaggerSpec(getMetadataArgsStorage: () => any, routingControllersOptions: any) {
    const schemas: { [schema: string]: any } = validationMetadatasToSchemas({
        // 设置 JSON Schema 的引用指针前缀
        refPointerPrefix: '#/components/schemas/',
    })

    // 将路由控制器解析为 OpenAPI 规范
    const storage = getMetadataArgsStorage()
    return routingControllersToSpec(storage, routingControllersOptions, {
        components: {
            schemas,
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        // 定义安全要求，这里使用 bearerAuth
        security: [{ bearerAuth: [] }],
        // 定义 OpenAPI 规范的基本信息，包括描述、标题和版本号
        info: {
            description: 'node框架游戏服务',
            title: 'game-service',
            version: '1.0.0',
        },
    })
}

export const swaggerSpec = (getMetadataArgsStorage: () => any, routingControllersOptions: any, app: any) => {
    const spec = buildSwaggerSpec(getMetadataArgsStorage, routingControllersOptions)
    // 在 Express 应用中使用 Swagger UI，提供 Swagger 文档的可视化界面
    app.use('/docs', swaggerUiExpress.serve, swaggerUiExpress.setup(spec))
}
