import axios from 'axios'

const reqUrl = 'http://10.130.0.23:11006/center/login'

async function testGet() {
    const res = await axios.get(reqUrl, {
        params: {
            id: 1,
        },
    })
    console.log(res)
}

async function testPostForm() {

    const res = await axios.postForm(reqUrl + '?id=10', { 'firstName': 'yang', 'lastName': 'dage' })
    console.log(res)
}

async function testPostJson() {

    const res = await axios.post(reqUrl + '?id=10', { 'firstName': 'yang', 'lastName': 'dage' })
    console.log(res)
    console.log(typeof res.data)
    console.log(res.data.say)
}

testPostJson()