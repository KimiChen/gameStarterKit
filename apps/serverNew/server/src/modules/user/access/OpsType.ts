export class OpsType {
    static readonly ACTIVITY: number = 1 // 活动检查

    static readonly SYSTEM: number = 2 // 系统检查

    static readonly ALL: number = 3 // 全部

    /** 账号关闭 */
    static readonly SWITCH_TYPE_CLOSE: number = 0

    /** 账号启用 */
    static readonly SWITCH_TYPE_OPEN: number = 1

    static readonly TABLE_OPS_DEVICE: string = 'ops_device'

    static readonly ACCOUNT_TYPE_WHITE: number = 1

    static readonly ACCOUNT_TYPE_TEST_WHITE: number = 2

    static switchMaps: number[] = [OpsType.SWITCH_TYPE_CLOSE, OpsType.SWITCH_TYPE_OPEN]

    static maps: number[] = [OpsType.ACTIVITY, OpsType.SYSTEM, OpsType.ALL]

    public static checkSystem(type: number): boolean {
        return type === this.SYSTEM || type === this.ALL
    }

    public static checkActivity(type: number): boolean {
        return type === this.ACTIVITY || type === this.ALL
    }

    public static isOpt(type: number): boolean {
        return type === this.ACTIVITY || type === this.ALL || type === this.SYSTEM
    }
}
