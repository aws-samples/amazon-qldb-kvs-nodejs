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

const QLDBHelper = require("../dist/index").QLDBHelper;
const assert = require("assert");
const constants = require("./QLDBHelper.Constants");

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('Test UpSertNewDocument.test', () => {
    let qldbHelper;
    it('Test QLDB Helper constructor', async () => {
        qldbHelper = new QLDBHelper(constants.LEDGER_NAME);
    });

    it('Test upsertDocumentWithKeyAttribute', async () => {
        const res = await qldbHelper.upsertDocumentWithKeyAttribute(constants.TABLE_NAME, constants.KEY_ATTRIBUTE_NAME, constants.UPSERT_DOC_BODY);
        console.log(`[TEST LOGS]Test upsert result: ${res}`)
        assert.ok(typeof res == "number");
    }).timeout(20000);

});