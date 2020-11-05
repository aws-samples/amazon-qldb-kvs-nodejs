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
const flipRandomBit = require("../dist/Verifier").flipRandomBit;
const toBase64 = require("ion-js").toBase64;
const assert = require("assert");
const constants = require("./QLDBHelper.Constants");

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('Test 5.VerifyLedgerDataForDocument.test', () => {
    let qldbHelper;
    let ledgerMetadata;
    it('Test QLDB Helper constructor', async () => {
        qldbHelper = new QLDBHelper(constants.LEDGER_NAME);
    });

    it('Test getDocumentLedgerMetadata', async () => {
        const res = await qldbHelper.getDocumentLedgerMetadata(constants.TABLE_NAME, constants.KEY_ATTRIBUTE_NAME, constants.UPSERT_DOC_BODY._key);
        console.log(`[TEST LOGS]Test getDocumentLedgerMetadata result: ${JSON.stringify(res)}`)
        assert.ok(res.LedgerDigest.Digest);
        // Making sure we convert ledgerMetadata from text
        ledgerMetadata = JSON.parse(JSON.stringify(res));
    }).timeout(200000);

    it('Test verifyDocumentMetadataWithUserData', async () => {
        console.log(`[TEST LOGS]Sending ledgerMetadata: ${JSON.stringify(ledgerMetadata)}`)
        const res = await qldbHelper.verifyDocumentMetadataWithUserData(ledgerMetadata);
        console.log(`[TEST LOGS]Test verifyDocumentMetadataWithUserData result: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(200000);

    it('Test verifyDocumentMetadataWithUserData is failing if we swap random bit in document revision hash', async () => {
        let revisionHashBinary = Buffer.from(ledgerMetadata.RevisionHash, 'base64');
        const spoiledRevisionHashBinary = flipRandomBit(revisionHashBinary);
        const spoiledRevisionHashBase64 = toBase64(spoiledRevisionHashBinary);
        ledgerMetadata.RevisionHash = spoiledRevisionHashBase64;
        console.log(`[TEST LOGS]Sending ledgerMetadata with flipped random bit: ${JSON.stringify(ledgerMetadata)}`)
        await assert.rejects(qldbHelper.verifyDocumentMetadataWithUserData(constants.TABLE_NAME, ledgerMetadata));
    }).timeout(200000);

    it('Test getDocumentHistory', async () => {
        console.log(`[TEST LOGS]Getting history for ${constants.KEY_ATTRIBUTE_NAME} = ${constants.QUERY_DOC_KEY}`)
        const res = await qldbHelper.getDocumentHistory(constants.TABLE_NAME, constants.KEY_ATTRIBUTE_NAME, constants.QUERY_DOC_KEY);
        console.log(`[TEST LOGS]Test getDocumentHistory result: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(200000);

    it('Test getDocumentVersionByIdAndBlock', async () => {
        console.log(`[TEST LOGS]Getting Document Revision for Id "${ledgerMetadata.DocumentId}" and Block Sequence Number "${JSON.stringify(ledgerMetadata.BlockAddress)}"`)
        const res = await qldbHelper.getDocumentVersionByIdAndBlock(constants.TABLE_NAME, ledgerMetadata.DocumentId, ledgerMetadata.BlockAddress);
        console.log(`[TEST LOGS]Test getDocumentVersionByIdAndBlock result: ${JSON.stringify(res)}`)
        assert.ok(res);
    }).timeout(200000);
});