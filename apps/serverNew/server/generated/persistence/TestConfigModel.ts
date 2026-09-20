import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Entity('test_config')
export class TestConfigModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'config_name', comment: '配置名称', length: 100 })
    configName!: string

    @Column('longtext', { name: 'config_content', comment: '配置内容' })
    configContent!: string

    @Column('int', { name: 'server_id', comment: '区服id', default: () => "'0'" })
    serverId!: number

    @Column('varchar', { name: 'salt', comment: '盐', length: 32 })
    salt!: string

    @Column('int', {
        name: 'create_ts',
        comment: '导入时间',
        default: () => "'0'",
    })
    createTs!: number

    @Column('int', {
        name: 'update_ts',
        comment: '更新时间',
        default: () => "'0'",
    })
    updateTs!: number

    @Column('blob', {
        name: 'lua_content',
        nullable: true,
        comment: 'lua配置文件',
    })
    luaContent!: Buffer | null

    @Column('int', {
        name: 'can_start',
        comment: '配置表是否可启动',
        default: () => "'0'",
    })
    canStart!: number

    @Column('longtext', { name: 'json_content', comment: 'json配置' })
    jsonContent!: string

    @Column('int', {
        name: 'available',
        comment: '配置表是否可用',
        default: () => "'0'",
    })
    available!: number

    @Column('varchar', {
        name: 'php_file_path',
        comment: '归档php配置路径',
        length: 255,
    })
    phpFilePath!: string

    @Column('varchar', {
        name: 'lua_file_path',
        comment: '归档lua配置路径',
        length: 255,
    })
    luaFilePath!: string

    @Column('varchar', {
        name: 'json_file_path',
        comment: '归档json配置路径',
        length: 255,
    })
    jsonFilePath!: string

    static readonly f_id = 'id'

    static readonly f_config_name = 'config_name'

    static readonly f_config_content = 'config_content'

    static readonly f_server_id = 'server_id'

    static readonly f_salt = 'salt'

    static readonly f_create_ts = 'create_ts'

    static readonly f_update_ts = 'update_ts'

    static readonly f_lua_content = 'lua_content'

    static readonly f_can_start = 'can_start'

    static readonly f_json_content = 'json_content'

    static readonly f_available = 'available'

    static readonly f_php_file_path = 'php_file_path'

    static readonly f_lua_file_path = 'lua_file_path'

    static readonly f_json_file_path = 'json_file_path'
}
