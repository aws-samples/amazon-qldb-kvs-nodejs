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
describe('4.QLDBKVS.Verify.test', () => {
    let qldbKVS;
    let ledgerMetadata;
    let updateResponse;
    let ledgerMetadataByTxId;
    let documentHistory;
    let documentRevision;
    beforeAll(async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME, false);
        await qldbKVS.setValues([constants.DOC_OBJECT_KEY, constants.DOC_STRING_KEY], [constants.DOC_OBJECT_VALUE, constants.DOC_STRING_VALUE]);
    });

    it('Test getMetadata', async () => {
        const res = await qldbKVS.getMetadata(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getMetadata: ${JSON.stringify(res)}`)
        expect(res.LedgerName).toBeTruthy();
        // Making sure we convert ledgerMetadata from text
        ledgerMetadata = JSON.parse(JSON.stringify(res));
    }, 30000);

    it('Updating String to change Metadata in Ledger and retrieving metadata by document id and transaction id and Retrieving metadata by document id and transaction id for the recent update', async () => {
        updateResponse = await qldbKVS.setValue(constants.DOC_STRING_KEY, constants.DOC_STRING_VALUE);
        console.log(`[TEST LOGS]Updating String to change Metadata in Ledger. Response: ${JSON.stringify(updateResponse)}`)
        console.log(`[TEST LOGS]Retrieving metadata by: ${JSON.stringify(updateResponse)}`)
        ledgerMetadataByTxId = await qldbKVS.getMetadataByDocIdAndTxId(updateResponse.documentId, updateResponse.txId);
        expect(ledgerMetadataByTxId).toBeTruthy();
    }, 30000);

    it('Test verifyLedgerMetadata for metadata before update', async () => {
        const res = await qldbKVS.verifyLedgerMetadata(ledgerMetadata);
        console.log(`[TEST LOGS]Test verifyLedgerMetadata: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 8000);

    it('Test verifyLedgerMetadata for metadata after update', async () => {
        const res = await qldbKVS.verifyLedgerMetadata(ledgerMetadata);
        console.log(`[TEST LOGS]Test verifyLedgerMetadata: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 8000);

    it('Test getHistory', async () => {
        const res = await qldbKVS.getHistory(constants.DOC_STRING_KEY);
        console.log(`[TEST LOGS]Test getHistory: ${JSON.stringify(res)}`)
        expect(res[0]).toBeTruthy();
        // Making sure we convert ledgerMetadata from text
        documentHistory = JSON.parse(JSON.stringify(res));
    }, 8000);

    it('Test getDocumentRevisionByLedgerMetadata', async () => {
        const res = await qldbKVS.getDocumentRevisionByLedgerMetadata(ledgerMetadata);
        console.log(`[TEST LOGS]Test getDocumentRevisionByLedgerMetadata: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
        // Making sure we convert ledgerMetadata from text
        documentRevision = JSON.parse(JSON.stringify(res));
    }, 8000);

    it('Test verifyDocumentRevisionHash', async () => {
        const res = qldbKVS.verifyDocumentRevisionHash(documentRevision);
        console.log(`[TEST LOGS]Test verifyDocumentRevisionHash: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 8000);

    it('Test verifyDocumentRevisionHash fails if revision has been changed', async () => {
        documentRevision.data._val = "EvilValue";
        const res = qldbKVS.verifyDocumentRevisionHash(documentRevision);
        console.log(`[TEST LOGS]Test verifyDocumentRevisionHash: ${JSON.stringify(res)}`)
        expect(res).toBeFalsy();
    }, 8000);

});