import assert from 'assert'
import { UtilJson } from '../../src/utils/UtilJson'
import { testInitEnv } from '../testInit'
import { is_numeric } from '../../src/utils/common'

describe('test common', function () {
    before(async () => {
        await testInitEnv()
    })

    it('is_numeric', () => {
        assert(is_numeric(123))
        assert(is_numeric('123'))
        assert(is_numeric('123.124124'))
        assert(is_numeric('-123.124124'))
        assert(!is_numeric('+123.124124'))
        assert(!is_numeric('123/0'))
    })

})
