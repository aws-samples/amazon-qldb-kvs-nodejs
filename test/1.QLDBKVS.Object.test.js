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

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('1.QLDBKVS.Object.test', () => {
    let qldbKVS;
    let docVersion = 0;

    beforeAll(async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME);
    });

    it('Test setValue String', async () => {
        const res = await qldbKVS.setValue(constants.DOC_STRING_KEY, constants.DOC_STRING_VALUE);
        console.log(`[TEST LOGS]Test setValue: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 30000);

    it('Test setValue Object', async () => {
        const res = await qldbKVS.setValue(constants.DOC_OBJECT_KEY, constants.DOC_OBJECT_VALUE);
        console.log(`[TEST LOGS]Test setValue: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 15000);

    it('Test getValue String', async () => {
        const res = await qldbKVS.getValue(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getValue: ${JSON.stringify(res)}`)
        expect(res).toEqual(constants.DOC_STRING_VALUE)
    }, 10000);

    it('Test getValue Object', async () => {
        const res = await qldbKVS.getValue(constants.DOC_OBJECT_KEY);
        console.log(`[TEST LOGS]Test getValue: ${JSON.stringify(res)}`)
        expect(res).toEqual(constants.DOC_OBJECT_VALUE)
    }, 10000);

    it('Test catching rejection from getValue for non-existing Object', async () => {
        let testResult = false;
        try {
            const res = await qldbKVS.getValue("noKeyEver");
        } catch (err) {
            console.log(`[TEST LOGS]Test getValue non-existing Object. Successfully caught rejection: ${err}`)
            testResult = true;
        }
        expect(testResult).toBeTruthy();
    }, 5000);

    it('Test getValue Object with version', async () => {
        const res = await qldbKVS.getValue(constants.DOC_OBJECT_KEY, true);
        docVersion = res.version;
        console.log(`[TEST LOGS]Test getValue with version: ${JSON.stringify(res)}`)
        expect(res.data).toEqual(constants.DOC_OBJECT_VALUE)
    }, 10000);

    it('Test setValue Object with version lock', async () => {
        const res = await qldbKVS.setValue(constants.DOC_OBJECT_KEY, constants.DOC_OBJECT_VALUE, docVersion);
        console.log(`[TEST LOGS]Test setValue with version lock: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 30000);

    it('Test catching rejection from setValue for wrong Object version', async () => {
        let testResult = false;
        let wrongDocVersion = 1000;
        try {
            const res = await qldbKVS.setValue(constants.DOC_OBJECT_KEY, constants.DOC_OBJECT_VALUE, wrongDocVersion);
        } catch (err) {
            console.log(`[TEST LOGS]Test setValue for wrong Object version. Successfully caught rejection: ${err}`)
            testResult = true;
        }
        expect(testResult).toBeTruthy();
    }, 5000);
});