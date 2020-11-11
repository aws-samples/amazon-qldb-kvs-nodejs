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
describe('9.QLDBKVS.Verify.test', () => {
    let qldbKVS;
    let ledgerMetadata;
    it('Test QLDB Helper constructor', async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME);
    });

    it('Test getMetadata', async () => {
        const res = await qldbKVS.getMetadata(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getMetadata: ${JSON.stringify(res)}`)
        assert.ok(res.LedgerName);
        // Making sure we convert ledgerMetadata from text
        ledgerMetadata = JSON.parse(JSON.stringify(res));
    }).timeout(30000);

    it('Updating String to change Metadata in Ledger', async () => {
        const res = await qldbKVS.setValue(constants.DOC_STRING_KEY, constants.DOC_STRING_VALUE);
        console.log(`[TEST LOGS]Updating String to change Metadata in Ledger. Doc ID: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(30000);

    it('Test verifyMetadata', async () => {
        const res = await qldbKVS.verifyMetadata(ledgerMetadata);
        console.log(`[TEST LOGS]Test verifyMetadata: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(8000);

    it('Test getHistory', async () => {
        const res = await qldbKVS.getHistory(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getHistory: ${JSON.stringify(res)}`)
        assert.ok(res[0]);
        // Making sure we convert ledgerMetadata from text
        ledgerMetadata = JSON.parse(JSON.stringify(res));
    }).timeout(8000);

});