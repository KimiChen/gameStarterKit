/* eslint-disable max-len */

import { NextFunction, ParamsDictionary } from 'express-serve-static-core'
import { Request, Response } from 'express'

export interface HttpRequest<ReqQuery = any, ReqBody = any> extends Request<ParamsDictionary, any, ReqBody, ReqQuery> { }
export interface HttpResponse<ResBody = any> extends Response<ResBody> { }

export function routeCallBack<ReqQuery = any, ResBody = any, ReqBody = any>(handler: (hReq: HttpRequest<ReqQuery, ReqBody>, hRes: HttpResponse<ResBody>) => Promise<void>) {
    return async (req: Request<ParamsDictionary, any, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => {
        try {
            await handler(req, res)
        } catch (e) {
            next(e)
        }
    }
}