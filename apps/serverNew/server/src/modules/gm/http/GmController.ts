import { Get, JsonController, Post, Req } from 'routing-controllers'
import { Service } from 'typedi'
import { GmRequestDispatcher } from './GmRequestDispatcher'
import { Request } from 'express'
import { OpenAPI } from 'routing-controllers-openapi'

@JsonController('/gm')
@Service()
export class GmController {
    @OpenAPI({ summary: 'gmDoApi入口' })
    @Post('/api')
    @Get('/api')
    async doApi(@Req() req: Request) {
        return new GmRequestDispatcher().doApi(req)
    }
}
