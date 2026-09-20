import { AdjustChange } from './AdjustChange'
import { FixedServerEndpoint } from '../../../http/FixedServerEndpoint'

/**
 * 服务器工具
 */
export class AdjustServer extends AdjustChange {
    /** @group 服务器工具 @canCustom @sort 10 */
    async findServerList() {
        const endpoint = FixedServerEndpoint.get(SERVER_ID)
        return endpoint ? [{ 区服: endpoint.sid, IP: endpoint.host, 端口: endpoint.port }] : []
    }

    /**
     * 测试网页打开
     * @group 服务器工具
     * @canCustom
     * @sort  2
     */
    async testWebOpen() {
        return '<!DOCTYPE html><body style="color:red" onclick="alert(123)">测试网页打开</body></html>'
    }

    /**
     * 测试文本打开
     * @group 服务器工具
     * @canCustom
     * @sort  2
     */
    async testTextOpen() {
        return '其他普通字符串或富文本<h1 style="color:red" onclick="alert(123)">测试网页打开</h1>'
    }

    /**
     * 测试返回对象
     * @group 服务器工具
     * @canCustom
     * @sort  3
     */
    async testReturnObject() {
        return { a: { b: 1 }, 甲: 2 }
    }
}
