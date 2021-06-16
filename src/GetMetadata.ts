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

import { Result, TransactionExecutor } from "amazon-qldb-driver-nodejs";
import { QLDB } from "aws-sdk";
import { GetRevisionResponse, ValueHolder } from "aws-sdk/clients/qldb";
import { dom, toBase64 } from "ion-js";

import { getLedgerDigest } from './GetDigest';
import { blockAddressToValueHolder, getMetadataId } from './BlockAddress';
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");
import { getBlobValue, valueHolderToString, Base64EncodedString, sleep, validateTableNameConstrains, validateAttributeNameConstrains } from "./Util";
import { getRevision, getRevisionMetadataByDocIdAndTxId } from "./GetRevision";

export interface LedgerMetadata {
    LedgerName: string
    TableName: string
    BlockAddress: ValueHolder
    DocumentId: string
    RevisionHash: Base64EncodedString
    Proof: ValueHolder
    LedgerDigest: LedgerDigest
}

export interface LedgerDigest {
    Digest: Base64EncodedString
    DigestTipAddress: ValueHolder
}

/**
 * Query the table metadata for a document with a particular key for verification.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param tableName The table name to query.
 * @param keyAttributeName A keyAttributeName to query.
 * @param keyAttributeValue The key of the given keyAttributeName.
 * @returns Promise which fulfills with a list of Ion values that contains the results of the query.
 */
export async function lookupBlockAddressAndDocIdForKey(txn: TransactionExecutor,
    tableName: string,
    keyAttributeName: string,
    keyAttributeValue: string): Promise<dom.Value[]> {

    const fcnName = "[GetMetadata lookupBlockAddressAndDocIdForKey]"
    try {
        logger.debug(`${fcnName} Querying the '${tableName}' table for key ${keyAttributeName}: ${keyAttributeValue}...`);
        let resultList: dom.Value[];

        validateTableNameConstrains(tableName);
        validateAttributeNameConstrains(keyAttributeName);
        const query = `SELECT blockAddress, metadata.id FROM _ql_committed_${tableName} WHERE data.${keyAttributeName} = ?`;
        logger.debug(`${fcnName} Constructed query: ${query}`);

        const result: Result = await txn.execute(query, keyAttributeValue)
        resultList = result.getResultList();
        return resultList;
    } catch (err) {
        logger.debug(`${fcnName} ${err} `)
        throw `${fcnName} ${err} `
    }
}

/**
 * Retrieve full ledger metadata of the most recent revision of the document for the given Key.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param ledgerName The ledger to get the digest from.
 * @param tableName The table name to query.
 * @param keyAttributeName A keyAttributeName to query.
 * @param keyAttributeValue The key of the given keyAttributeName.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with void.
 * @throws Error: When verification fails.
 */
export async function getDocumentLedgerMetadata(
    txn: TransactionExecutor,
    ledgerName: string,
    tableName: string,
    keyAttributeName: string,
    keyAttributeValue: string,
    qldbClient: QLDB,
    ledgerDigest?: LedgerDigest
): Promise<LedgerMetadata> {
    const fcnName = "[GetMetadata getDocumentLedgerMetadata]";

    try {
        logger.debug(`${fcnName} Getting metadata for document with "${keyAttributeName}" = ${keyAttributeValue}, in ledger = ${ledgerName}.`);

        // Getting Block Address and Document Id for the document
        logger.debug(`${fcnName} Getting Block Address and Document Id for the document`);
        const blockAddressAndIdList: dom.Value[] = await lookupBlockAddressAndDocIdForKey(txn, tableName, keyAttributeName, keyAttributeValue);

        logger.debug(`${fcnName} Received ${blockAddressAndIdList.length} Block Address and Document Id combination.`);
        if (!blockAddressAndIdList.length) {
            throw `Unable to find block address and document id associated with "${keyAttributeName}" = ${keyAttributeValue}`
        }
        const blockAddressAndId = blockAddressAndIdList[blockAddressAndIdList.length - 1]
        const blockAddress: ValueHolder = blockAddressToValueHolder(blockAddressAndId);

        logger.debug(`${fcnName} Getting a proof for the document.`);

        let digest: LedgerDigest = ledgerDigest;

        if (!ledgerDigest) {
            // Requesting ledger digest
            logger.debug(`${fcnName} Requesting ledger digest`);
            let ledgerDigest = await getLedgerDigest(ledgerName, qldbClient);

            // Checking if digest sequenceNo has caught up with block sequenceNo
            const digestTipAddressSeqNo = dom.load(ledgerDigest.DigestTipAddress.IonText).get("sequenceNo");
            const blockAddressSeqNo = dom.load(blockAddress.IonText).get("sequenceNo");
            if (digestTipAddressSeqNo < blockAddressSeqNo) {
                logger.debug(`${fcnName} The ledger digest sequenceNo is behind the block sequenceNo, so retrying after 100 ms`);
                await sleep(100);
                ledgerDigest = await getLedgerDigest(ledgerName, qldbClient);
            }

            const digestBase64: Base64EncodedString = toBase64(<Uint8Array>ledgerDigest.Digest);
            digest = {
                Digest: digestBase64,
                DigestTipAddress: ledgerDigest.DigestTipAddress
            }

            logger.debug(`${fcnName} Got Ledger Digest: ${JSON.stringify(digest)} `)
        }

        // Converting digest from default buffer array to base64 format
        const digestTipAddress: ValueHolder = digest.DigestTipAddress;

        logger.debug(`${fcnName} Got a ledger digest: digest tip address = ${valueHolderToString(digestTipAddress)}, \n digest = ${digest.Digest}.`);

        // Getting revision
        const documentId: string = getMetadataId(blockAddressAndId);

        logger.debug(`${fcnName} Getting document revision with the following parameters: ${JSON.stringify({
            ledgerName: ledgerName,
            documentId: documentId,
            blockAddress: blockAddress,
            digestTipAddress: digestTipAddress
        })}`);

        const revisionResponse: GetRevisionResponse = await getRevision(
            ledgerName,
            documentId,
            blockAddress,
            digestTipAddress,
            qldbClient
        );

        const revision: dom.Value = dom.load(revisionResponse.Revision.IonText);
        const revisionHash: Base64EncodedString = toBase64(<Uint8Array>getBlobValue(revision, "hash"));
        const proof: ValueHolder = revisionResponse.Proof;
        logger.debug(`${fcnName} Got back a proof: ${valueHolderToString(proof)}.`);

        return {
            LedgerName: ledgerName,
            TableName: tableName,
            BlockAddress: blockAddress,
            DocumentId: documentId,
            RevisionHash: revisionHash,
            Proof: proof,
            LedgerDigest: digest
        };
    } catch (err) {
        throw `${fcnName} ${err} `
    }
}

/**
 * Retrieve full ledger metadata of the most recent revision of the document for the given Key.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param ledgerName The ledger to get the digest from.
 * @param tableName The table name to query.
 * @param keyAttributeName A keyAttributeName to query.
 * @param keyAttributeValue The key of the given keyAttributeName.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with void.
 * @throws Error: When verification fails.
 */
export async function getDocumentLedgerMetadataByDocIdAndTxId(
    txn: TransactionExecutor,
    ledgerName: string,
    tableName: string,
    documentId: string,
    transactionId: string,
    qldbClient: QLDB
): Promise<LedgerMetadata> {
    const fcnName = "[GetMetadata getDocumentLedgerMetadataByDocIdAndTxId]";

    try {
        logger.debug(`${fcnName} Getting metadata for document with documentId = ${documentId} and transactionId = ${transactionId}, in ledger = ${ledgerName} and table = ${tableName}.`);

        // Getting Block Address and Document Id for the document
        logger.debug(`${fcnName} Getting revision metadata for the document`);
        const revisionMetadata: dom.Value = await getRevisionMetadataByDocIdAndTxId(txn, tableName, documentId, transactionId);

        logger.debug(`${fcnName} Received metadata ${revisionMetadata}`);
        if (!revisionMetadata) {
            throw `Unable to find revision metadata for documentId = ${documentId} and transactionId = ${transactionId}`
        }
        //const blockAddressAndId = blockAddressAndIdList[blockAddressAndIdList.length - 1]
        const blockAddress: ValueHolder = blockAddressToValueHolder(revisionMetadata);

        logger.debug(`${fcnName} Getting a proof for the document.`);

        // Requesting ledger digest
        logger.debug(`${fcnName} Requesting ledger digest`);
        let ledgerDigest = await getLedgerDigest(ledgerName, qldbClient);

        // Checking if digest sequenceNo has caught up with block sequenceNo
        const digestTipAddressSeqNo = dom.load(ledgerDigest.DigestTipAddress.IonText).get("sequenceNo");
        const blockAddressSeqNo = dom.load(blockAddress.IonText).get("sequenceNo");
        if (digestTipAddressSeqNo < blockAddressSeqNo) {
            logger.debug(`${fcnName} The ledger digest sequenceNo is behind the block sequenceNo, so retrying after 100 ms`);
            await sleep(100);
            ledgerDigest = await getLedgerDigest(ledgerName, qldbClient);
        }

        const digestBase64: Base64EncodedString = toBase64(<Uint8Array>ledgerDigest.Digest);

        const digest: LedgerDigest = {
            Digest: digestBase64,
            DigestTipAddress: ledgerDigest.DigestTipAddress
        }

        logger.debug(`${fcnName} Got Ledger Digest: ${JSON.stringify(digest)} `)

        // Converting digest from default buffer array to base64 format
        const digestTipAddress: ValueHolder = digest.DigestTipAddress;

        logger.debug(`${fcnName} Got a ledger digest: digest tip address = ${valueHolderToString(digestTipAddress)}, \n digest = ${digest.Digest}.`);

        // Getting revision

        logger.debug(`${fcnName} Getting document revision with the following parameters: ${JSON.stringify({
            ledgerName: ledgerName,
            documentId: documentId,
            blockAddress: blockAddress,
            digestTipAddress: digestTipAddress
        })}`);

        const revisionResponse: GetRevisionResponse = await getRevision(
            ledgerName,
            documentId,
            blockAddress,
            digestTipAddress,
            qldbClient
        );

        const revision: dom.Value = dom.load(revisionResponse.Revision.IonText);
        const revisionHash: Base64EncodedString = toBase64(<Uint8Array>getBlobValue(revision, "hash"));
        const proof: ValueHolder = revisionResponse.Proof;
        logger.debug(`${fcnName} Got back a proof: ${valueHolderToString(proof)}.`);

        return {
            LedgerName: ledgerName,
            TableName: tableName,
            BlockAddress: blockAddress,
            DocumentId: documentId,
            RevisionHash: revisionHash,
            Proof: proof,
            LedgerDigest: digest
        };
    } catch (err) {
        throw `${fcnName} ${err} `
    }
}