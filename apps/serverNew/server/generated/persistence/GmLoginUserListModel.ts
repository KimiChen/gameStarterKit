import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('open_id', ['openId'], { unique: true })
@Entity('gm_login_user_list')
export class GmLoginUserListModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', {
        name: 'open_id',
        unique: true,
        comment: '账号id',
        length: 64,
    })
    openId!: string

    @Column('varchar', {
        name: 'login_secret',
        comment: '账号登录密码，加密后',
        length: 128,
    })
    loginSecret!: string

    @Column('varchar', { name: 'login_salt', comment: '密码的盐值', length: 16 })
    loginSalt!: string

    @Column('int', {
        name: 'create_time',
        comment: '密码创建时间,判断密码有效期',
    })
    createTime!: number

    static readonly f_id = 'id'

    static readonly f_open_id = 'open_id'

    static readonly f_login_secret = 'login_secret'

    static readonly f_login_salt = 'login_salt'

    static readonly f_create_time = 'create_time'
}
