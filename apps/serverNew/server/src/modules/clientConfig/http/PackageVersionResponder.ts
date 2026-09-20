import { Response } from 'express'
import { Service } from 'typedi'
import { PackageVersionQuery } from '../../user/http/UserLoginQuery'
import { PackageVersionResolver } from './PackageVersionResolver'

@Service()
export class PackageVersionResponder {
    constructor(private readonly resolver: PackageVersionResolver) {}

    async send(query: PackageVersionQuery, response: Response) {
        const cdnSec = query.cdnSec == '' ? -1 : Number(query.cdnSec)
        Log.http.info(query)

        let versionInfo = {}
        let dataFrom = ''
        try {
            if (query.pf == 'bearjoy') {
                versionInfo = ['android', 'ios'].includes(query.platform)
                    ? await this.resolver.debugLastAppCDN(query.branch, query.platform)
                    : await this.resolver.debugLastResCDN(query.platform)
            } else {
                dataFrom = 'service'
                versionInfo = await this.resolver.requestPackageManagerMicroService(
                    query.channelId,
                    query.channelChildId,
                    query.appVer,
                    query.resVer,
                    query.deviceId,
                    PLATFORM_VERSION,
                )
            }
        } catch (error) {
            Log.http.error(error)
        } finally {
            response.send(
                await this.resolver.returnData(versionInfo, cdnSec, query.platform, query.pf, query.deviceId, dataFrom),
            )
        }
    }
}
