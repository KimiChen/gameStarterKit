
function print1(num){
    return (num+'a').length
}

function print2(fun2){
    return 'a'
}

let now = new Date().getTime()
for (let i = 0; i < 1000_0000; i++) {
    print1(`a ${i} b ${i+1} c ${i+2}`)
}
console.log(new Date().getTime()-now) //1000万次731ms

now = new Date().getTime()
for (let i = 0; i < 1000_0000; i++) {
    print2(()=>(`a ${i} b ${i+1} c ${i+2}`).length)
}
console.log(new Date().getTime()-now)
const ff = ()=>(`aa`).length
console.log(typeof ff)

