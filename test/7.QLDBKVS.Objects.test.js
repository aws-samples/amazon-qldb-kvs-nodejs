/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with
 * the License. A copy of the License is located at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

const QLDBKVS = require("../dist/index").QLDBKVS;
const assert = require("assert");
const constants = require("./QLDBKVS.Constants");

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('7.QLDBKVS.Objects.test', () => {
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

    it('Test getValues', async () => {
        const res = await qldbKVS.getValues([constants.DOC_STRING_KEY, constants.DOC_OBJECT_KEY]);
        console.log(`[TEST LOGS]Test getValues: ${JSON.stringify(res)}`)
        assert.deepStrictEqual(res, [constants.DOC_STRING_VALUE, constants.DOC_OBJECT_VALUE])
    }).timeout(10000);

    it('Test getValues one value does not exist', async () => {
        const res = await qldbKVS.getValues([constants.DOC_STRING_KEY, "noKey"]);
        console.log(`[TEST LOGS]Test getValues: ${JSON.stringify(res)}`)
        assert.deepStrictEqual(res, [constants.DOC_STRING_VALUE])
    }).timeout(10000);
});