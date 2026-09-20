import type { TelemetryPropertiesProvider } from '../../../telemetry/TelemetryPropertiesRegistry'
import type { User } from '../bean/User'

export class UserTelemetryProperties implements TelemetryPropertiesProvider {
    readonly name = 'user'

    provide(source: unknown) {
        const user = source as User
        return {
            taVersion: user.taVersion ?? 0,
            device_id: user.deviceId,
            role_source: '',
            open_id: user.openid,
            account_id: user.id.toString(),
            server_id: user.sId.toString(),
            mix_id: '',
            line_id: PLATFORM,
            role_name: user.name,
            role_level: user.lv,
            role_vip_level: user.vip,
            role_fp: user.realmUpFp,
            current_gc: user.gc,
        }
    }
}
