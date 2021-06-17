/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *   
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const QLDBKVS = require("../dist/index").QLDBKVS;
const constants = require("./QLDBKVS.Constants");

function _makeStr(length) {
    var result = [];
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() *
            charactersLength)));
    }
    return result.join('');
}

const _generateSampleStringsArray = (numberOfStrings, lengthOfStrings) => {
    let strings = []
    for (let i = 0; i < numberOfStrings; i++) {
        const str = _makeStr(lengthOfStrings);
        strings.push(str);
    }
    return strings;
}

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('2.QLDBKVS.Objects.test', () => {
    let qldbKVS;
    let versionsArray = [];

    beforeAll(async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME);
    });

    it('Test setValues Object and String', async () => {
        const res = await qldbKVS.setValues([constants.DOC_OBJECT_KEY, constants.DOC_STRING_KEY], [constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE]);
        console.log(`[TEST LOGS]Test setValues: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 20000);

    it('Test setValues for 9 Strings', async () => {
        const res = await qldbKVS.setValues(_generateSampleStringsArray(9, 10), _generateSampleStringsArray(9, 10000));
        console.log(`[TEST LOGS]Test setValues: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 70000);

    it('Test getValues', async () => {
        const res = await qldbKVS.getValues([constants.DOC_STRING_KEY, constants.DOC_OBJECT_KEY]);
        console.log(`[TEST LOGS]Test getValues: ${JSON.stringify(res)}`)
        expect(res).toEqual(expect.arrayContaining([constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE]))
    }, 10000);

    it('Test getValues one value does not exist', async () => {
        const res = await qldbKVS.getValues([constants.DOC_STRING_KEY, "noKey"]);
        console.log(`[TEST LOGS]Test getValues: ${JSON.stringify(res)}`)
        expect(res).toEqual([constants.DOC_STRING_VALUE])
    }, 10000);

    it('Test getValues with versions', async () => {
        const res = await qldbKVS.getValues([constants.DOC_STRING_KEY, constants.DOC_OBJECT_KEY], true);
        console.log(`[TEST LOGS]Test getValues with versions: ${JSON.stringify(res)}`)
        const resultDataArray = res.map((result) => {
            return result.data
        })
        const resultVersionsArray = res.map((result) => {
            return result.version
        })
        versionsArray = resultVersionsArray;
        expect(resultDataArray).toEqual(expect.arrayContaining([constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE]))
    }, 10000);


    it('Test rejection in setValues Object and String with one incorrect version', async () => {
        const wrongVersion = 10000;
        let testResult = false;
        try {
            const res = await qldbKVS.setValues([constants.DOC_OBJECT_KEY, constants.DOC_STRING_KEY], [constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE], [versionsArray[0], wrongVersion]);
            console.log(`[TEST LOGS]Test rejection in setValues Object and String with one incorrect version': ${JSON.stringify(res)}`)
        } catch (err) {
            console.log(`[TEST LOGS]Test rejection in setValues Object and String with one incorrect version. Successfully caught rejection: ${err}`)
            testResult = true;
        }
        expect(testResult).toBeTruthy();
    }, 20000);

    it('Test setValues Object and String with correct versions', async () => {
        const res = await qldbKVS.setValues([constants.DOC_OBJECT_KEY, constants.DOC_STRING_KEY], [constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE], versionsArray);
        console.log(`[TEST LOGS]Test setValues Object and String with correct versions: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 20000);
});