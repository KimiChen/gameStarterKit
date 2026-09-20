import { Url, UrlResonse, http_build_query_sort, md5 } from '@arthropoda/game-engine'
import { Service } from 'typedi'
import { DeviceWhiteModel } from '../../../../generated/persistence/DeviceWhiteModel'
import { GamePackageModel } from '../../../../generated/persistence/GamePackageModel'
import { GmConfigCatalog, GmConfigVersion } from '../../gm/config/GmConfig'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { PackageVersionResponse } from '../../user/http/UserLoginQuery'

interface PackageVersionRecord {
    res_ver_upt?: string
    cdn_ver_cur?: string
    code_ver_business?: string
    res_is_force_upt?: number
    res_is_restart_upt?: number
    code_ver_frame?: string
    pkg_ver_upt?: string
    pkg_is_force_upt?: number
    pkg_upt_url?: string
    cdn_ver_upt?: string
    pf?: string
    gv?: string
    is_jump?: number
    pkg_is_inner_upt?: number
}

/**
 * 游戏包信息管理
 */
@Service()
export class PackageVersionResolver {
    /**
     * 开发模式下使用爬取的最新版本信息
     * @param branch 分支
     * @param platform 平台
     * @returns
     */
    async debugLastAppCDN(branch: string, platform: string) {
        const cdnBaseUrl = CP.platform.cdn.baseUrl

        const versionTextKey = `gameVersion_${branch}.txt`
        const codeKey = `codeVersion_${branch}.txt`
        const pytsKey = `pytsVersion_${branch}.txt`
        const separateVersionTextKey = `separateVersion_${branch}.txt`

        const platformDir = platform == 'ios' ? 'ios' : 'android'
        const versionTextKeyUrl = `${cdnBaseUrl}/${platformDir}/${versionTextKey}`
        const separateVersionTextKeyUrl = `${cdnBaseUrl}/${platformDir}/${separateVersionTextKey}`
        const codeKeyUrl = `${cdnBaseUrl}/${platformDir}/${codeKey}`
        const pytsKeyUrl = `${cdnBaseUrl}/${platformDir}/${pytsKey}`

        let results: UrlResonse[]
        try {
            results = await Promise.all([
                Url.get(versionTextKeyUrl),
                Url.get(separateVersionTextKeyUrl),
                Url.get(codeKeyUrl),
                Url.get(pytsKeyUrl),
            ])
        } catch (e) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: (e as any).message } })
        }
        // 检测results是否都成功
        if (results.length != 4) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'results不是4条结果' } })
        }
        for (let i = 0; i < results.length; i++) {
            const result = results[i]
            if (!(result.status == 200 || result.status == 404)) {
                throw SystemErrors.SysParamError.params({ vars: { reqMsg: `第${i}请求结果不正确` } })
            }
        }
        const versionText: string = results[0].status == 200 ? results[0].data : ''
        const separateVersionText: string = results[1].status == 200 ? results[1].data : ''
        const codeVersionText: string = results[2].status == 200 ? results[2].data : ''
        const pytsVersionText: string = results[3].status == 200 ? results[3].data : ''

        const versionTextKeyMatch = versionText.match(/\d+\.\d+\.\d+/)
        if (versionTextKeyMatch == null) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'no version in txt' } })
        }

        const separateVersionTextMatch = separateVersionText.match(/\d+\.\d+\.\d+/)
        if (separateVersionText.length > 0 && separateVersionTextMatch == null) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'no separate cdn num in txt' } })
        }

        const codeVersionTextMatch = codeVersionText.match(/\d+\.\d+\.\d+/)
        if (codeVersionTextMatch == null) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'no codeVersion cdn num in txt' } })
        }

        const pytsVersionTextMatch = pytsVersionText.match(/pytsVer=([a-z0-9]+)/)
        if (pytsVersionTextMatch == null) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'no pytsVersion cdn num in txt' } })
        }

        const pkg_ver_upt = versionTextKeyMatch[0]
        const cdn_ver_cur = separateVersionTextMatch ? separateVersionTextMatch[0] : ''
        const code_ver = codeVersionTextMatch[0]
        const pyts_ver = pytsVersionTextMatch.length >= 2 ? pytsVersionTextMatch[1] : ''

        const verInfo = await this.getPackageVerInfo(branch)

        const vInfo: PackageVersionRecord = {
            res_ver_upt: pkg_ver_upt,
            cdn_ver_cur: cdn_ver_cur,
            code_ver_business: code_ver,
            res_is_force_upt: 0,
            res_is_restart_upt: 1,
            code_ver_frame: pyts_ver,
            pkg_ver_upt: verInfo ? verInfo.packageVer : '',
            pkg_is_force_upt: verInfo ? verInfo.packageForceUpdate : 0,
            pkg_upt_url: verInfo ? verInfo.packageUpdateAddr : '',
        }
        return vInfo
    }

    /**
     * 开发模式下使用爬取的最新版本信息
     * @param platform
     * @returns
     */
    async debugLastResCDN(platform: string) {
        const cdnBaseUrl = CP.platform.cdn.baseUrl
        const versionTextKey = 'gameVersion.txt'
        const versionTextKeyUrl = `${cdnBaseUrl}/${platform}/${versionTextKey}`
        const urlRes = await Url.get(versionTextKeyUrl)
        if (urlRes.status != 200) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'gameVersion.txt error' } })
        }
        const versionText: string = urlRes.data
        const versionTextKeyMatch = versionText.match(/\d+\.\d+\.\d+/)
        if (!versionTextKeyMatch) {
            throw SystemErrors.SysParamError.params({ vars: { reqMsg: 'versionTextKeyMatch null' } })
        }
        const pkg_ver_upt = versionTextKeyMatch[0]
        const vInfo: PackageVersionRecord = {
            res_ver_upt: pkg_ver_upt,
            res_is_force_upt: 0,
            res_is_restart_upt: 1,
        }
        return vInfo
    }

    /**
     * 调用包管理微服务
     * @param channelId 渠道id
     * @param channelChildId 渠道子id
     * @param pkgVer 包版本 形如1.1.1
     * @param resVer 资源版本
     * @param deviceId 设备id
     * @param gv 平台标识
     * @returns
     */
    async requestPackageManagerMicroService(
        channelId: string,
        channelChildId: string,
        pkgVer: string,
        resVer: string,
        deviceId: string,
        gv: string,
    ) {
        const versionConfig = GmConfigCatalog.version
        if (!versionConfig) {
            throw new Error('version config is null')
        }
        const urlParam = {
            game_id: versionConfig.game_id, //游戏id
            platform_id: versionConfig.platform_id, //平台id
        }

        const params = {
            channel_id: channelId, //渠道id
            channel_child_id: channelChildId, //渠道子id
            pkg_ver: pkgVer, //整包版本
            res_ver: resVer, //资源包版本
            gv: gv, //平台标识
            device_id: deviceId, //设备id
            ...urlParam,
        }

        this.sign(urlParam, versionConfig)

        const urlPath = versionConfig.version_url + '/check'
        const result = await Url.postJson(urlPath, params, urlParam, undefined)
        if (result.status != 200 || !result.data || result.data.code !== 0) {
            Log.http.error(`status=${result.status}, body=${result.data}`)
            throw new Error(`requestPackageManagerMicroService status=${result.status}`)
        }
        return result.data.data as PackageVersionRecord
    }

    /**
     * 查询分支的最新版本信息
     * @param branch
     * @returns
     */
    async getPackageVerInfo(branch: string) {
        return GamePackageModel.findOneBy({ platform: branch })
    }

    /**
     * 返回值类型影响客户端逻辑，调整需要和客户端联调通过才提交
     * @param vInfo
     * @param cdnSec
     * @param platform
     * @param pf
     * @param deviceId
     * @param dataFrom
     * @returns
     */
    async returnData(
        vInfo: PackageVersionRecord,
        cdnSec: number,
        platform: string,
        pf: string,
        deviceId: string,
        dataFrom: string,
    ) {
        const gv = vInfo.gv ?? ''
        const isJump = vInfo.is_jump ?? 0

        let code = 0
        if (dataFrom == 'service') {
            if (Object.keys(vInfo).length == 0) {
                code = 1
            }
        }

        let resUrl = CP.platform.cdn.baseUrl
        let loginUrl = ''
        const gameUrlConf = CA.game_url
        if (isJump && gameUrlConf[gv] && gameUrlConf[gv][pf]) {
            // 是否跳转
            loginUrl = gameUrlConf[gv][pf]
        } else {
            loginUrl = `http://${CP.platform.host}:${CP.platform.port}`
        }

        // http 或者https
        if (cdnSec >= 0) {
            if (cdnSec == 0) {
                loginUrl = loginUrl.replace('https://', 'http://')
                resUrl = resUrl.replace('https://', 'http://')
            } else {
                loginUrl = loginUrl.replace('http://', 'https://')
                resUrl = resUrl.replace('http://', 'https://')
            }
        }

        let isDeviceWhite = 0
        if (deviceId.length > 0) {
            const row = await DeviceWhiteModel.findOneBy({ deviceId: deviceId })
            isDeviceWhite = row ? 1 : 0
        }

        const packageRes: PackageVersionResponse = {
            code: code,

            loginUrl: loginUrl,
            resUrl: resUrl,
            frontWhite: isDeviceWhite,
            logOn: 1,

            baseVersion: vInfo.pkg_ver_upt ?? '',
            packageUrl: vInfo.pkg_upt_url ?? '',
            packageForceUpdate: vInfo.pkg_is_force_upt ?? 0,

            resVersion: vInfo.res_ver_upt ?? '',
            resForceUpdate: vInfo.res_is_force_upt ?? 0,
            packageCdnVer: vInfo.cdn_ver_cur ?? '',
            packageCdnVer2: vInfo.cdn_ver_upt ?? '',

            updateRestart: vInfo.res_is_restart_upt ?? 0,
            isJump: vInfo.is_jump ?? 0,
            downLoadType: vInfo.pkg_is_inner_upt ?? 0,
            codeVer: vInfo.code_ver_business ?? '',
            pytsVer: vInfo.code_ver_frame ?? '',
            separateVer: vInfo.cdn_ver_cur ?? '',

            //0:表示不管包多大都弹窗;1就表示 通过silentDownloadLimit 来比较大小判断要不要弹窗;2:表示不管多大都不弹窗;
            silentDownloadFlag: CP.platform.cdn.silentDownloadFlag ?? 0,
            //不弹确认框 直接下载的 大小限制 (只有 silentDownloadFlag=1 时才有意义)
            silentDownloadLimit: CP.platform.cdn.silentDownloadLimit ?? 300 * 1024,
        }

        if (packageRes.isJump > 0) {
            packageRes.url = `${loginUrl}/center/packageVersion`
            packageRes.pf = vInfo.pf ? vInfo.pf : platform
            packageRes.gv = vInfo.gv ? vInfo.gv : ''
        }
        if (PLATFORM == 'bearjoy') {
            packageRes.isAb = 1
        }

        return packageRes
    }

    sign(urlParam: any, versionConfig: GmConfigVersion) {
        const query = http_build_query_sort(urlParam)
        const signVal = md5(query + versionConfig.app_secret)

        urlParam.sign = signVal
    }
}
