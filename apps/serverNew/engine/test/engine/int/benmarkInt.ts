let a = -2.2
let rs = 0
let now = new Date().getTime()
console.log(now)
for (let i = 0; i < 10000_0000; i++) {
    rs += a++ % 1 === 0 ? 1 : 0
}
console.log(rs > 0, '%0===0 用时', -now + (now = new Date().getTime()), 'ms')

a = -2.2
rs = 0
for (let i = 0; i < 10000_0000; i++) {
    rs += Number.isInteger(a++) ? 1 : 0
}
console.log(rs > 0, 'Number.isInteger 用时', -now + (now = new Date().getTime()), 'ms')

a = -2.2
rs = 0
for (let i = 0; i < 10000_0000; i++) {
    rs += Math.trunc(a++)
}
console.log(rs, 'Math.trunc 用时', -now + (now = new Date().getTime()), 'ms')

a = -2.2
rs = 0
for (let i = 0; i < 10000_0000; i++) {
    rs += a++ | 0
}
console.log(rs, '| 0 用时', -now + (now = new Date().getTime()), 'ms')
