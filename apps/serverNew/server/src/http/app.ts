/* eslint-disable quotes */
import 'reflect-metadata'
import express from 'express'
import { useContainer, useExpressServer, getMetadataArgsStorage, RoutingControllersOptions } from 'routing-controllers'
import { Container } from 'typedi'
import { swaggerSpec } from './swagger'
import logger from 'morgan'
import cookieParser from 'cookie-parser'
import path from 'path'
import { AdjustRouter, GameError } from '@arthropoda/game-engine'
import { GameModuleCatalog } from '../startup/GameModuleCatalog'
import { toolAccessMiddleware } from './security/sso/sso.access'
import { HttpErrorMiddleware } from './middlewares/HttpErrorMiddleware'

// required by routing-controllers
useContainer(Container)

// Create express server
const app: express.Express = express()

app.use((req, res, next) => {
    // 设置允许跨域的源
    res.setHeader('Access-Control-Allow-Origin', '*')
    // 设置允许的请求方法
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
    // 设置允许的请求头
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Adjust-Tool-Source')
    // 继续处理下一个中间件
    next()
})

/**
 * combined: 标准Apache组合日志输出。
 * common: 标准Apache公共日志输出。
 * dev: 简洁输出，包含颜色编码的响应状态，用于开发环境。
 * short: 简短的输出。
 * tiny: 最小化的输出。
 */
app.use(logger('combined'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

// error handler
app.use(function (err: any, req: any, res: any, next: any) {
    if (err instanceof GameError) {
        res.send(err.getFailResponse())
    } else {
        // set locals, only providing error in development
        res.locals.message = err.message
        res.locals.error = req.app.get('env') === 'development' ? err : {}

        // render the error page
        res.status(err.status || 500)

        res.send({
            message: res.locals.message,
            status: res.locals.error.status,
            stack: res.locals.error,
        })
    }
    Log.http.error(err)
})

const routingControllersOptions: RoutingControllersOptions = {
    routePrefix: '',
    defaultErrorHandler: false,
    cors: true,
    authorizationChecker: undefined,
    controllers: GameModuleCatalog.systems.managementHttp.entries.flatMap((entry) =>
        entry.contribution.kind === 'controller' ? [entry.contribution.controller] : [],
    ),
    middlewares: [
        ...GameModuleCatalog.systems.managementHttp.entries.flatMap((entry) =>
            entry.contribution.kind === 'middleware' ? [entry.contribution.middleware] : [],
        ),
        HttpErrorMiddleware,
    ],
    interceptors: [],
}

app.use(toolAccessMiddleware)
app.use('/adjust', AdjustRouter)

// 用路由控制器包装服务器
useExpressServer(app, routingControllersOptions)

// Setup Swagger
swaggerSpec(getMetadataArgsStorage, routingControllersOptions, app)

export default app
