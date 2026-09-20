import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Entity('migrations')
export class Migrations extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('bigint', { name: 'timestamp' })
    timestamp!: string

    @Column('varchar', { name: 'name', length: 255 })
    name!: string

    static readonly f_id = 'id'

    static readonly f_timestamp = 'timestamp'

    static readonly f_name = 'name'
}
