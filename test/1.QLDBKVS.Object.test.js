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
const assert = require("assert");
const constants = require("./QLDBKVS.Constants");

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('1.QLDBKVS.Object.test', () => {
    let qldbKVS;
    it('Test QLDB Helper constructor', async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME);
    });

    it('Test setValue String', async () => {
        const res = await qldbKVS.setValue(constants.DOC_STRING_KEY, constants.DOC_STRING_VALUE);
        console.log(`[TEST LOGS]Test setValue: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(30000);

    it('Test setValue Object', async () => {
        const res = await qldbKVS.setValue(constants.DOC_OBJECT_KEY, constants.DOC_OBJECT_VALUE);
        console.log(`[TEST LOGS]Test setValue: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(15000);

    it('Test getValue String', async () => {
        const res = await qldbKVS.getValue(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getValue: ${JSON.stringify(res)}`)
        assert.strictEqual(res, constants.DOC_STRING_VALUE)
    }).timeout(10000);

    it('Test getValue Object', async () => {
        const res = await qldbKVS.getValue(constants.DOC_OBJECT_KEY);
        console.log(`[TEST LOGS]Test getValue: ${JSON.stringify(res)}`)
        assert.deepStrictEqual(res, constants.DOC_OBJECT_VALUE)
    }).timeout(10000);

    it('Test catching rejection from getValue for non-existing Object', async () => {
        let testResult = false;
        try {
            const res = await qldbKVS.getValue("noKeyEver");
        } catch (err) {
            console.log(`[TEST LOGS]Test getValue non-existing Object. Successfully caught rejection: ${err}`)
            testResult = true;
        }
        assert.ok(testResult);
    }).timeout(5000);

});