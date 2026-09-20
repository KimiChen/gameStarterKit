import assert from 'node:assert/strict'
import { createSsoSessionToken, parseSsoSessionToken } from '../../../src/http/security/sso/sso.token'

const secret = 'test-session-secret'
const payload = {
    openId: '100__SSO',
    sessionId: 'session-1',
    issuedAt: 100,
    expiresAt: 200,
}

const token = createSsoSessionToken(payload, secret)
assert.deepStrictEqual(parseSsoSessionToken(token, secret), payload)

const [body, tokenSignature] = token.split('.')
assert.strictEqual(parseSsoSessionToken(`${body}x.${tokenSignature}`, secret), null)
assert.strictEqual(parseSsoSessionToken(`${body}.${tokenSignature}x`, secret), null)
assert.strictEqual(parseSsoSessionToken(token, 'another-secret'), null)

console.log('ok - SSO session token contract')
