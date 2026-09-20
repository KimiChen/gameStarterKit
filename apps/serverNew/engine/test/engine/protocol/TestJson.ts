
const test = `{'1':{B:2,C:200,G:{'2':{A:2,B:230},'25':{A:25,B:2}},I:{}},'2':{B:3,C:500,G:{'3':{A:3,B:175},'26':{A:26,B:5}},I:{}},'3':{B:4,C:1300,G:{'3':{A:3,B:390},'26':{A:26,B:13}},I:{}},'4':{B:3,C:800,G:{'2':{A:2,B:440},'25':{A:25,B:8}},I:{}},'5':{B:6,C:1600,G:{'1':{A:1,B:384000},'27':{A:27,B:16}},I:{}},'6':{B:8,C:2400,D:1000,G:{'3':{A:3,B:600},'6':{A:6,B:25},'26':{A:26,B:24}},I:{}},'7':{B:4,C:1400,G:{'1':{A:1,B:56000},'27':{A:27,B:14}},I:{}},'8':{B:4,C:1100,G:{'3':{A:3,B:165},'26':{A:26,B:11}},I:{}},'9':{B:2,C:400,G:{'3':{A:3,B:40},'26':{A:26,B:4}},I:{}},'10':{B:1,C:100,G:{'1':{A:1,B:73000},'27':{A:27,B:1}}},'11':{B:1,C:100,G:{'1':{A:1,B:72000},'27':{A:27,B:1}}},'12':{B:1,C:100,G:{'1':{A:1,B:71000},'27':{A:27,B:1}}},'13':{B:1,C:100,G:{'1':{A:1,B:74000},'27':{A:27,B:1}}},'14':{B:1,C:100,G:{'3':{A:3,B:350},'26':{A:26,B:1}}},'15':{B:1,C:100,G:{'2':{A:2,B:345},'25':{A:25,B:1}}},'16':{B:1,C:100,G:{'3':{A:3,B:655},'26':{A:26,B:1}}},'17':{B:1,C:100,G:{'2':{A:2,B:645},'25':{A:25,B:1}}},'18':{B:1,C:100,G:{'1':{A:1,B:127000},'27':{A:27,B:1}}}}`

import json5 from 'json5';

const json5Txt = JSON.stringify(json5.parse(test))
const jsonTxt = JSON.stringify(json5.parse(test))
const runTimes = 10000

json5Test(json5Txt)
jsonTest(jsonTxt)

function jsonTest(jsonString: string): void {
    const startTime = process.hrtime();
    for (let i = 0; i < runTimes; i++) {
        const jsonData = json5.parse(jsonString);
    }
    const endTime = process.hrtime();
    const elapsedTime = endTime[0] - startTime[0] + (endTime[1] - startTime[1]) / 1e9;
    console.log(`JSON解析所需的时间: ${elapsedTime} 秒`);
}

function json5Test(jsonString: string) {
    const startTime = process.hrtime();
    for (let i = 0; i < runTimes; i++) {
        const jsonData = JSON.parse(jsonString);
    }
    const endTime = process.hrtime();
    const elapsedTime = endTime[0] - startTime[0] + (endTime[1] - startTime[1]) / 1e9;
    console.log(`JSON5解析所需的时间: ${elapsedTime} 秒`);
}

