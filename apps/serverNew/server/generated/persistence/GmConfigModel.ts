import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('module', ['module'], { unique: true })
@Entity('gm_config')
export class GmConfigModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', {
        name: 'module',
        unique: true,
        comment: '模块的key',
        length: 64,
    })
    module!: string

    @Column('varchar', {
        name: 'config_content',
        comment: '模块的配置详情:json格式',
        length: 2048,
    })
    configContent!: string

    @Column('int', {
        name: 'update_time',
        comment: '配置上次更新的时间',
        default: () => "'0'",
    })
    updateTime!: number

    static readonly f_id = 'id'

    static readonly f_module = 'module'

    static readonly f_config_content = 'config_content'

    static readonly f_update_time = 'update_time'
}
