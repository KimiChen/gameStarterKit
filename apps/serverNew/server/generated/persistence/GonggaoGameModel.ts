import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('start_time', ['startTime'], {})
@Index('end_time', ['endTime'], {})
@Index('uqid', ['uqid'], {})
@Index('update_time', ['updateTime'], {})
@Index('op_user_id', ['opUserId'], {})
@Entity('gonggao_game')
export class GonggaoGameModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('int', { name: 'start_time' })
    startTime!: number

    @Column('int', { name: 'end_time' })
    endTime!: number

    @Column('varchar', { name: 'title', length: 256 })
    title!: string

    @Column('text', { name: 'content', comment: '公告内容' })
    content!: string

    @Column('int', { name: 'sort_index', comment: '排序' })
    sortIndex!: number

    @Column('int', { name: 'uqid', comment: '版本号' })
    uqid!: number

    @Column('int', { name: 'all_platform', comment: '是否全平台1:是0否' })
    allPlatform!: number

    @Column('text', { name: 'server_id', comment: '区服ids' })
    serverId!: string

    @Column('int', { name: 'is_jump', comment: '是否跳转' })
    isJump!: number

    @Column('varchar', { name: 'jump_url', comment: '跳转地址', length: 1024 })
    jumpUrl!: string

    @Column('int', { name: 'update_time', comment: '更新的时间戳' })
    updateTime!: number

    @Column('int', { name: 'is_close', comment: '关闭状态' })
    isClose!: number

    @Column('int', { name: 'op_user_id', comment: '平台操作人id' })
    opUserId!: number

    @Column('tinyint', {
        name: 'type',
        comment: '公告类型',
        default: () => "'1'",
    })
    type!: number

    @Column('varchar', { name: 'img', comment: '公告图片', length: 200 })
    img!: string

    @Column('int', {
        name: 'act_start_time',
        comment: '活动开始时间',
        default: () => "'0'",
    })
    actStartTime!: number

    @Column('int', {
        name: 'act_end_time',
        comment: '活动结束时间',
        default: () => "'0'",
    })
    actEndTime!: number

    static readonly f_id = 'id'

    static readonly f_start_time = 'start_time'

    static readonly f_end_time = 'end_time'

    static readonly f_title = 'title'

    static readonly f_content = 'content'

    static readonly f_sort_index = 'sort_index'

    static readonly f_uqid = 'uqid'

    static readonly f_all_platform = 'all_platform'

    static readonly f_server_id = 'server_id'

    static readonly f_is_jump = 'is_jump'

    static readonly f_jump_url = 'jump_url'

    static readonly f_update_time = 'update_time'

    static readonly f_is_close = 'is_close'

    static readonly f_op_user_id = 'op_user_id'

    static readonly f_type = 'type'

    static readonly f_img = 'img'

    static readonly f_act_start_time = 'act_start_time'

    static readonly f_act_end_time = 'act_end_time'
}
