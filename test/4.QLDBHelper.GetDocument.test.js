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
describe('Test QueryDocument', () => {
    let qldbHelper;
    let documentId;
    it('Test QLDB Helper constructor', async () => {
        qldbHelper = new QLDBHelper(constants.LEDGER_NAME);
    });

    it('Test getDocumentByKeyAttribute', async () => {
        const res = await qldbHelper.getDocumentByKeyAttribute(constants.TABLE_NAME, constants.KEY_ATTRIBUTE_NAME, constants.QUERY_DOC_KEY);
        const valueObject = res[0].get(constants.VALUE_ATTRIBUTE_NAME);
        console.log(`[TEST LOGS]Test getDocumentByKeyAttribute Result: ${JSON.stringify(valueObject)}`)
        assert.ok(res);
    }).timeout(20000);

    it('Test getDocumentIds', async () => {
        const res = await qldbHelper.getDocumentIds(constants.TABLE_NAME, constants.KEY_ATTRIBUTE_NAME, constants.QUERY_DOC_KEY);
        console.log(`[TEST LOGS]Test getDocumentIdResult: ${JSON.stringify(res)}`);
        documentId = res[0];
        assert.ok(res[0]);
    }).timeout(20000);

    it('Test getDocumentById', async () => {
        const res = await qldbHelper.getDocumentById(constants.TABLE_NAME, documentId);
        console.log(`[TEST LOGS]Test getDocumentByIdResult: ${JSON.stringify(res)}`);
        let document = constants.UPSERT_DOC_BODY;
        document.id = documentId;
        assert.deepEqual(res[0].get(constants.VALUE_ATTRIBUTE_NAME).stringValue(), constants.UPSERT_DOC_BODY[constants.VALUE_ATTRIBUTE_NAME]);
    }).timeout(20000);
});