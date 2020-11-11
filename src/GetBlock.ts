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

import { QLDB } from "aws-sdk";
import { Digest, GetBlockRequest, GetBlockResponse, GetDigestResponse, ValueHolder } from "aws-sdk/clients/qldb";
import { toBase64 } from "ion-js";

import { getLedgerDigest } from './GetDigest';
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");
import { blockResponseToString, valueHolderToString } from "./Util";
import { flipRandomBit, parseBlock, verifyDocumentMetadata } from "./Verifier";
import { Base64EncodedString } from "aws-sdk/clients/elastictranscoder";

/**
 * Get the block of a ledger's journal.
 * @param ledgerName Name of the ledger to operate on.
 * @param blockAddress The location of the block to request.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with a GetBlockResponse.
 */
async function getBlock(ledgerName: string, blockAddress: ValueHolder, qldbClient: QLDB): Promise<GetBlockResponse> {
    logger.debug(
        `Let's get the block for block address \n${valueHolderToString(blockAddress)} \nof the ledger ` +
        `named ${ledgerName}.`
    );
    const request: GetBlockRequest = {
        Name: ledgerName,
        BlockAddress: blockAddress
    };
    const result: GetBlockResponse = await qldbClient.getBlock(request).promise();
    logger.debug(`Success. GetBlock: \n${blockResponseToString(result)}.`);
    return result;
}

/**
 * Get the block of a ledger's journal. Also returns a proof of the block for verification.
 * @param ledgerName Name of the ledger to operate on.
 * @param blockAddress The location of the block to request.
 * @param digestTipAddress The location of the digest tip.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with a GetBlockResponse.
 */
async function getBlockWithProof(
    ledgerName: string,
    blockAddress: ValueHolder,
    digestTipAddress: ValueHolder,
    qldbClient: QLDB
): Promise<GetBlockResponse> {
    logger.debug(
        `Let's get the block for block address \n${valueHolderToString(blockAddress)}, \ndigest tip address:
        ${valueHolderToString(digestTipAddress)} \nof the ledger named ${ledgerName}.`
    );
    const request: GetBlockRequest = {
        Name: ledgerName,
        BlockAddress: blockAddress,
        DigestTipAddress: digestTipAddress
    };
    const result: GetBlockResponse = await qldbClient.getBlock(request).promise();
    logger.debug(`Success. GetBlock: \n${blockResponseToString(result)}.`);
    return result;
}

/**
 * Verify block by validating the proof returned in the getBlock response.
 * @param ledgerName The ledger to get the digest from.
 * @param blockAddress The address of the block to verify.
 * @param qldbClient The QLDB control plane client to use.
 * @returns Promise which fulfills with void.
 * @throws Error: When verification fails.
 */
export async function verifyBlock(ledgerName: string, blockAddress: ValueHolder, qldbClient: QLDB): Promise<void> {
    logger.debug(`Let's verify blocks for ledger with name = ${ledgerName}.`);
    try {
        logger.debug("First, let's get a digest.");
        const digestResult: GetDigestResponse = await getLedgerDigest(ledgerName, qldbClient);
        const digestBytes: Digest = digestResult.Digest;
        const digestTipAddress: ValueHolder = digestResult.DigestTipAddress;
        logger.debug(
            `Got a ledger digest. Digest end address = \n${valueHolderToString(digestTipAddress)}, ` +
            `\ndigest = ${toBase64(<Uint8Array>digestBytes)}.`
        );

        const getBlockResult: GetBlockResponse = await getBlockWithProof(
            ledgerName,
            blockAddress,
            digestTipAddress,
            qldbClient
        );
        const block: ValueHolder = getBlockResult.Block;
        const blockHash: Uint8Array = parseBlock(block);

        const digestBase64: Base64EncodedString = toBase64(<Uint8Array>digestBytes);

        let verified: boolean = verifyDocumentMetadata(blockHash, digestBase64, getBlockResult.Proof);
        if (!verified) {
            throw new Error("Block is not verified!");
        } else {
            logger.debug("Success! The block is verified!");
        }

        const alteredDigest: Uint8Array = flipRandomBit(digestBytes);
        logger.debug(
            `Let's try flipping one bit in the digest and assert that the block is NOT verified.
            The altered digest is: ${toBase64(alteredDigest)}.`
        );

        const alteredDigestBase64: Base64EncodedString = toBase64(<Uint8Array>alteredDigest);

        verified = verifyDocumentMetadata(blockHash, alteredDigestBase64, getBlockResult.Proof);
        if (verified) {
            throw new Error("Expected block to not be verified against altered digest.");
        } else {
            logger.debug("Success! As expected flipping a bit in the digest causes verification to fail.");
        }

        const alteredBlockHash: Uint8Array = flipRandomBit(blockHash);
        logger.debug(
            `Let's try flipping one bit in the block's hash and assert that the block is NOT verified.
            The altered block hash is: ${toBase64(alteredBlockHash)}.`
        );
        verified = verifyDocumentMetadata(alteredBlockHash, digestBase64, getBlockResult.Proof);
        if (verified) {
            throw new Error("Expected altered block hash to not be verified against digest.");
        } else {
            logger.debug("Success! As expected flipping a bit in the block hash causes verification to fail.");
        }
    } catch (e) {
        logger.debug(`Failed to verify blocks in the ledger with name = ${ledgerName}.`);
        throw e;
    }
}