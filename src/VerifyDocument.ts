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

import { TransactionExecutor } from "amazon-qldb-driver-nodejs";
import { QLDB } from "aws-sdk";
import { Digest, GetDigestResponse, GetRevisionResponse, ValueHolder } from "aws-sdk/clients/qldb";
import { dom, toBase64 } from "ion-js";

import { blockAddressToValueHolder } from './BlockAddress';
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");
import { getBlobValue, valueHolderToString, Base64EncodedString } from "./Util";
import { flipRandomBit, verifyDocumentMetadata } from "./Verifier";
import { getDocumentLedgerMetadata, LedgerMetadata } from "./GetMetadata";
import { getRevision } from "./GetRevision"

/**
 * Verify a version of the document metadata for a given Key by retrieving it from the ledger.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param ledgerName The ledger to get the digest from.
 * @param tableName The table name to query.
 * @param keyAttributeName A keyAttributeName to query.
 * @param keyAttributeValue The key of the given keyAttributeName.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with void.
 * @throws Error: When verification fails.
 */
export async function verifyDocumentMetadataWithLedgerData(
    txn: TransactionExecutor,
    ledgerName: string,
    tableName: string,
    keyAttributeName: string,
    keyAttributeValue: string,
    qldbClient: QLDB
): Promise<void> {
    logger.debug(`Let's verify the document with "${keyAttributeName}" = ${keyAttributeValue}, in ledger = ${ledgerName}.`);

    const result = await getDocumentLedgerMetadata(txn, ledgerName, tableName, keyAttributeName, keyAttributeValue, qldbClient);

    const digest: GetDigestResponse = result.LedgerDigest;
    const digestBytes: Digest = digest.Digest;
    const digestTipAddress: ValueHolder = digest.DigestTipAddress;

    const blockAddress: ValueHolder = result.BlockAddress;
    const documentId: string = result.DocumentId;

    const revisionResponse: GetRevisionResponse = await getRevision(
        ledgerName,
        documentId,
        blockAddress,
        digestTipAddress,
        qldbClient
    );

    const revision: dom.Value = dom.load(revisionResponse.Revision.IonText);
    const documentHash: Uint8Array = getBlobValue(revision, "hash");
    const proof: ValueHolder = revisionResponse.Proof;
    logger.debug(`Got back a proof: ${valueHolderToString(proof)}.`);

    const digestBase64: Base64EncodedString = toBase64(<Uint8Array>digestBytes);

    let verified: boolean = verifyDocumentMetadata(documentHash, digestBase64, proof);

    if (!verified) {
        throw new Error("Document revision is not verified.");
    } else {
        logger.debug("Success! The document is verified.");
    }
    const alteredDocumentHash: Uint8Array = flipRandomBit(documentHash);

    logger.debug(
        `Flipping one bit in the document's hash and assert that the document is NOT verified.
            The altered document hash is: ${toBase64(alteredDocumentHash)}`
    );
    verified = verifyDocumentMetadata(alteredDocumentHash, digestBase64, proof);

    if (verified) {
        throw new Error("Expected altered document hash to not be verified against digest.");
    } else {
        logger.debug("Success! As expected flipping a bit in the document hash causes verification to fail.");
    }
    logger.debug(`Finished verifying the registration with "${keyAttributeName}" = ${keyAttributeValue} in ledger = ${ledgerName}.`);
}

/**
 * Verify a version of the document metadata for the given Key using metadata provided by the user.
 * @param ledgerName The ledger to get the digest from.
 * @param qldbClient The QLDB control plane client to use.
 * @param userLedgerMetadata The {@linkcode LedgerMetadata} object to verify against the ledger.
 * @returns Promise which fulfills with boolean.
 * @throws Error: When verification fails.
 */
export async function verifyDocumentMetadataWithUserData(
    ledgerName: string,
    qldbClient: QLDB,
    userLedgerMetadata: LedgerMetadata
): Promise<boolean> {
    const fcnName = "[VerifyDocumentMetadata verifyDocumentMetadataWithUserData]";
    try {
        logger.debug(`${fcnName} Verifying the document with Id = ${userLedgerMetadata.DocumentId}, in ledger = ${ledgerName}.`);
        logger.debug(`${fcnName} User Ledger Metadata: ${JSON.stringify(userLedgerMetadata)}`)

        const userRevisionHash: Base64EncodedString = userLedgerMetadata.RevisionHash;
        const userRevisionId: string = userLedgerMetadata.DocumentId;
        const userBlockAddress: ValueHolder = userLedgerMetadata.BlockAddress;
        //const userProof: ValueHolder = userLedgerMetadata.Proof;
        const userDigestBase64: Base64EncodedString = userLedgerMetadata.LedgerDigest.Digest;

        const revisionResponse: GetRevisionResponse = await getRevision(
            ledgerName,
            userLedgerMetadata.DocumentId,
            userLedgerMetadata.BlockAddress,
            userLedgerMetadata.LedgerDigest.DigestTipAddress,
            qldbClient
        );

        logger.debug(`${fcnName} Got revision: ${JSON.stringify(revisionResponse)}`)

        const revision: dom.Value = dom.load(revisionResponse.Revision.IonText);
        const blockAddress: ValueHolder = blockAddressToValueHolder(revision);
        const revisionHash: Uint8Array = getBlobValue(revision, "hash");
        const revisionId: string = revision.get("metadata", "id").stringValue();
        const proof: ValueHolder = revisionResponse.Proof;

        if ((userRevisionHash) !== toBase64(<Uint8Array>revisionHash)) {
            throw new Error(`${fcnName} Revision hashes do not match. Received from user: ${userRevisionHash}; Received from Ledger: ${toBase64(<Uint8Array>revisionHash)}`)
        }

        logger.debug(`${fcnName} Revision hash match with the ledger.`)

        if (userRevisionId !== revisionId) {
            throw new Error(`${fcnName} Revision IDs do not match. Received from user: ${userRevisionId}; Received from Ledger: ${revisionId}`)
        }

        logger.debug(`${fcnName} Revision ID match with the ledger.`)

        if (valueHolderToString(userBlockAddress) !== valueHolderToString(blockAddress)) {
            throw new Error(`${fcnName} BlockAddresses do not match. Received from user: ${valueHolderToString(userBlockAddress)}; Received from Ledger: ${valueHolderToString(blockAddress)}`)
        }

        logger.debug(`${fcnName} BlockAddress match with the ledger.`)
        logger.debug(`${fcnName} Got back a proof: ${valueHolderToString(proof)}.`);

        let userRevisionHashBinary: Uint8Array = Buffer.from(userRevisionHash, 'base64');

        const verifiedDocument: boolean = verifyDocumentMetadata(userRevisionHashBinary, userDigestBase64, proof);

        if (!verifiedDocument) {
            throw new Error(`${fcnName} Document revision is not verified.`);
        } else {
            logger.debug(`${fcnName} Success! The document is verified.`);
        }

        const alteredDocumentHash: Uint8Array = flipRandomBit(userRevisionHashBinary);

        logger.debug(
            `${fcnName} Flipping one bit in the document's hash and assert that the document is NOT verified. The altered document hash is: ${toBase64(alteredDocumentHash)}`
        );
        const verifiedAlteredDocument = verifyDocumentMetadata(alteredDocumentHash, userDigestBase64, proof);

        if (verifiedAlteredDocument) {
            throw new Error(`Expected altered document hash to not be verified against digest.`);
        } else {
            logger.debug(`${fcnName} Success! As expected flipping a bit in the document hash causes verification to fail.`);
        }
        logger.debug(`${fcnName} Finished verifying document with Id = ${userLedgerMetadata.DocumentId}, in ledger = ${ledgerName}.`);
        return verifiedDocument
    } catch (err) {
        throw `${fcnName} ${err} `
    }
}