import * as Joi from 'joi'

const schema: Joi.ObjectSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),

    password: Joi.string().pattern(new RegExp('^[a-zA-Z0-9]{3,30}$')),

    repeat_password: Joi.ref('password'),

    access_token: [Joi.string(), Joi.number()],

    birth_year: Joi.number().integer().min(1900).max(2013),

    email: Joi.string().email({ minDomainSegments: 2, tlds: { allow: ['com', 'net'] } }),
})
    .with('username', 'birth_year')
    .xor('password', 'access_token')
    .with('password', 'repeat_password')

// Also -

async function validateAsync() {

    const res1 = schema.validate({ username: 'abc', birth_year: 1994, access_token: '11' })
    console.log(res1.error)
    const res2 = schema.validate({})
    console.log(res2.error)
    try {
        const value = await schema.validateAsync({ username: 'abc', birth_year: 1994 })
    } catch (err) {
        console.log(err)
    }
}

validateAsync()