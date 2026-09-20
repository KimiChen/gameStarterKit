import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('p_c_c_pv', ['platform', 'channelId', 'channelChildId', 'packageVer'], {
    unique: true,
})
@Entity('game_package')
export class GamePackageModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'platform', comment: '平台标识', length: 32 })
    platform!: string

    @Column('varchar', { name: 'channel_id', comment: '渠道ID', length: 32 })
    channelId!: string

    @Column('varchar', {
        name: 'channel_child_id',
        comment: '渠道子ID',
        length: 32,
    })
    channelChildId!: string

    @Column('varchar', { name: 'package_ver', comment: '当前包版本', length: 32 })
    packageVer!: string

    @Column('varchar', {
        name: 'package_ver_update',
        comment: '当前包更新版本',
        length: 32,
    })
    packageVerUpdate!: string

    @Column('tinyint', {
        name: 'package_force_update',
        comment: '包是否强制更新',
        width: 1,
        default: () => "'0'",
    })
    packageForceUpdate!: number

    @Column('varchar', {
        name: 'package_update_addr',
        comment: '包强更地址',
        length: 128,
    })
    packageUpdateAddr!: string

    @Column('varchar', {
        name: 'package_res_ver',
        comment: '包资源版本',
        length: 32,
    })
    packageResVer!: string

    @Column('varchar', {
        name: 'package_force_res_ver',
        comment: '包强制资源版本',
        length: 32,
    })
    packageForceResVer!: string

    @Column('tinyint', {
        name: 'update_before_login',
        comment: '登录前更新',
        width: 1,
        default: () => "'0'",
    })
    updateBeforeLogin!: number

    @Column('tinyint', {
        name: 'update_restart',
        comment: '更新后是否重启',
        width: 1,
        default: () => "'0'",
    })
    updateRestart!: number

    static readonly f_id = 'id'

    static readonly f_platform = 'platform'

    static readonly f_channel_id = 'channel_id'

    static readonly f_channel_child_id = 'channel_child_id'

    static readonly f_package_ver = 'package_ver'

    static readonly f_package_ver_update = 'package_ver_update'

    static readonly f_package_force_update = 'package_force_update'

    static readonly f_package_update_addr = 'package_update_addr'

    static readonly f_package_res_ver = 'package_res_ver'

    static readonly f_package_force_res_ver = 'package_force_res_ver'

    static readonly f_update_before_login = 'update_before_login'

    static readonly f_update_restart = 'update_restart'
}
