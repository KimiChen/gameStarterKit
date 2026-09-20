import { IsNotEmpty, Min } from 'class-validator'

export class OrderCreateReq {
    @IsNotEmpty()
    key: string = ''

    @Min(1)
    sId: int = 0

    @IsNotEmpty()
    token: string = ''

    @IsNotEmpty()
    sdkInfo: string = ''
}
