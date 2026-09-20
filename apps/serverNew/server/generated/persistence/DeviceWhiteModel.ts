import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from '@arthropoda/typeorm'

@Index('device_id', ['deviceId'], { unique: true })
@Entity('device_white')
export class DeviceWhiteModel extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
    id!: number

    @Column('varchar', { name: 'device_id', unique: true, length: 64 })
    deviceId!: string

    static readonly f_id = 'id'

    static readonly f_device_id = 'device_id'
}
