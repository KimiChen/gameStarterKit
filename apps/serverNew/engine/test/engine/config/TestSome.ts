class Cat {
    constructor() {
        //
    }

    eat() {
        console.log('好吃、好吃')
    }
}

const fc = 'eat'

const cat = new Cat()
if (typeof cat[fc] == 'function') {
    cat[fc]()
}