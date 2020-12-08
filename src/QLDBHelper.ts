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

import { QldbDriver, TransactionExecutor, Result } from "amazon-qldb-driver-nodejs";
import { createQldbDriver } from "./ConnectToLedger"
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");
import { dom } from "ion-js";
import { getLedgerDigest } from "./GetDigest"
import { getByKeyAttribute, getByKeyAttributes, getDocumentById } from "./GetDocument"
import { getDocumentIds, validateTableNameConstrains, validateLedgerNameConstrains, validateAttributeNameConstrains } from "./Util"
import { upsert } from "./UpsertDocument"
import { getDocumentLedgerMetadata, LedgerMetadata } from "./GetMetadata"
import { verifyDocumentMetadataWithUserData } from "./VerifyDocument"
import { getDocumentRevisionByIdAndBlock, getDocumentHistory } from "./GetDocumentHistory"
import { ValueHolder } from "aws-sdk/clients/qldb";

import { config, QLDB } from "aws-sdk";

export { LedgerMetadata } from "./GetMetadata"

// if (logger.isLevelEnabled("debug")) {
//     config.logger = console;
// }

const qldbClient: QLDB = new QLDB();
let ledgersConnected: Map<string, QldbDriver> = new Map<string, QldbDriver>();

export class QLDBHelper {
    ledgerName: string;
    qldbDriver: QldbDriver;

    constructor(ledgerName: string) {
        const fcnName: string = "[QLDBHelper.constructor]";
        try {
            validateLedgerNameConstrains(ledgerName);
            this.ledgerName = ledgerName;
            logger.debug(`${fcnName} Creating QLDB driver`);

            if (!ledgersConnected.has(ledgerName)) {
                this.qldbDriver = createQldbDriver(ledgerName);
                ledgersConnected.set(ledgerName, this.qldbDriver);
            } else {
                logger.info(`Driver for ledger "${ledgerName}" already exists. Re-using it.`);
                this.qldbDriver = ledgersConnected.get(ledgerName);
            }

            logger.debug(`${fcnName} QLDB driver created`);
        } catch (err) {
            throw new Error(`${fcnName} ${err}`)
        }
        return this;
    }

    /**
     * Gets the most recent ledger digest.
     * @returns A JSON document with ledger digest.
     * @throws Error: If error happen during the process.
     */
    getLedgerDigest(): Promise<QLDB.GetDigestResponse> {
        const fcnName = "[QLDBHelper.getLedgerDigest]"
        return getLedgerDigest(this.ledgerName, qldbClient);
    }

    /**
     * Gets a document by the value of one attribute.
     * @param tableName The name of a table.
     * @param keyAttributeName The name of an attribute for indexing.
     * @param keyAttributeValue A value of a key attribute.
     * @returns Array of results as ION documents.
     * @throws Error: If error happen during the process.
     */
    async getDocumentByKeyAttribute(tableName: string, keyAttributeName: string, keyAttributeValue: string): Promise<dom.Value[]> {
        const fcnName = "[QLDBHelper.getDocumentByKeyAttribute]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getByKeyAttribute(txn, tableName, keyAttributeName, keyAttributeValue).catch((err) => {
                    throw `Couldn't getByKeyAttribute: ${err}`;
                });
            });

        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Gets a document by the value of one attribute.
     * @param tableName The name of a table.
     * @param keyAttributeName The name of an attribute for indexing.
     * @param keyAttributeValues A value of a key attribute.
     * @returns Array of results as ION documents.
     * @throws Error: If error happen during the process.
     */
    async getDocumentByKeyAttributes(tableName: string, keyAttributeName: string, keyAttributeValues: string[]): Promise<dom.Value[]> {
        const fcnName = "[QLDBHelper.getDocumentByKeyAttributes]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getByKeyAttributes(txn, tableName, keyAttributeName, keyAttributeValues).catch((err) => {
                    throw `Couldn't getByKeyAttributes: ${err}`;
                });
            });

        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Return an array of table names in UPPER CASE
     * @returns Returns an array of table names in UPPER CASE.
     * @throws Error: If error happen during the process.
     */
    async listTables(): Promise<string[]> {
        const fcnName = "[QLDBHelper.listTables]"
        try {
            logger.debug(`${fcnName} Listing table names...`);
            let tableNames: string[] = await this.qldbDriver.getTableNames();
            tableNames = tableNames.map(x => { return x.toUpperCase() });
            return tableNames;
        } catch (err) {
            throw new Error(`${fcnName} ${err}`)
        }
    }

    /**
     * Create table with index in a single transaction.
     * @param tableName Name of the table to create.
     * @param keyAttributeName A name of a key attribute belonging to a document.
     * @returns Promise which fulfills with the number of changes to the database. Returns 0 if table already exists.
     */
    async createTableWithIndex(tableName: string, keyAttributeName: string): Promise<number> {
        const fcnName = "[CreateTable.createTableWithIndex]"
        try {
            //// Listing tables names
            const tableNames: string[] = await this.listTables();

            //// Checking if table is already created and create if not
            logger.debug(`${fcnName} Checking if table with name ${tableName} exists`);
            if (tableNames.indexOf(tableName.toUpperCase()) < 0) {
                // Creating table
                return this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                    let resultsTotal: number = 0;

                    validateTableNameConstrains(tableName);
                    const statement: string = `CREATE TABLE ${tableName}`;
                    const resultCreateTable: Result = await txn.execute(statement)
                    logger.info(`${fcnName} Successfully created table ${tableName}. Creating index.`);
                    resultsTotal += resultCreateTable.getResultList().length;

                    validateAttributeNameConstrains(keyAttributeName);
                    const createIndexStatement = `CREATE INDEX on ${tableName} (${keyAttributeName})`;
                    const resultCreateIndex: Result = await txn.execute(createIndexStatement)
                    logger.info(`${fcnName} Successfully created index ${keyAttributeName} on table ${tableName}.`);
                    resultsTotal += resultCreateIndex.getResultList().length;
                    return resultsTotal;

                });
            } else {
                logger.debug(`${fcnName} Table with name "${tableName}" already exists`);
                return 0;
            }
        } catch (err) {
            throw new Error(`${fcnName} ${err}`)
        }
    }

    /**
     * Get the document IDs from the given table.
     * @param tableName The table name to query.
     * @param keyAttributeName A keyAttributeName to query.
     * @param keyAttributeValue The key of the given keyAttributeName.
     * @returns Promise which fulfills with the document ID as a string.
     */
    async getDocumentIds(tableName: string, keyAttributeName: string, keyAttributeValue: string): Promise<string[]> {
        const fcnName = "[QLDBHelper.getDocumentIds]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getDocumentIds(txn, tableName, keyAttributeName, keyAttributeValue);
            })

        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Get the document IDs from the given table.
     * @param tableName The table name to query.
     * @param documentId A document id as a string
     * @returns Promise which fulfills with the document ID as a string.
     */
    async getDocumentById(tableName: string, documentId: string): Promise<dom.Value[]> {
        const fcnName = "[QLDBHelper.getDocumentById]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getDocumentById(txn, tableName, documentId).catch((err) => {
                    throw err
                });
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
    * Updates or inserts a new document, using keyAttributeName to hold a unique key.
    * @param tableName The name of a table.
    * @param keyAttributeName The name of an attribute for indexing.
    * @param documentJSON Document to add to the table. Should contain an attribute with the name "keyAttributeName".
    * @returns Document Id
    * @throws Error: If error happen during the process.
    */
    async upsertDocumentWithKeyAttribute(tableName: string, keyAttributeName: string, documentJSON: object): Promise<number> {
        const fcnName: string = "[QLDBHelper.upsert]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await upsert(txn, tableName, keyAttributeName, documentJSON).catch((err) => {
                    throw err
                });
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Get ledger metadata information, associated with a specific document.
     * @param tableName The table name to query.
     * @param keyAttributeName A keyAttributeName to query.
     * @param keyAttributeValue The key of the given keyAttributeName.
     * @returns Promise which fulfills with a JSON object, containing .
     */
    async getDocumentLedgerMetadata(tableName: string, keyAttributeName: string, keyAttributeValue: string): Promise<LedgerMetadata> {
        const fcnName = "[QLDBHelper.getDocumentLedgerMetadata]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                const result: LedgerMetadata = await getDocumentLedgerMetadata(txn, this.ledgerName, tableName, keyAttributeName, keyAttributeValue, qldbClient).catch((err) => {
                    throw err
                });

                const endTime: number = new Date().getTime();
                logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)

                return result;
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Verify each version of the document for the given Key.
     * @param qldbClient The QLDB control plane client to use.
     * @param userLedgerMetadata The {@linkcode LedgerMetadata} object to verify against the ledger.
     * @returns Promise which fulfills with boolean.
     * @throws Error: When verification fails.
     */
    async verifyDocumentMetadataWithUserData(
        userLedgerMetadata: LedgerMetadata
    ): Promise<boolean> {
        const fcnName = "[QLDBHelper.verifyDocumentMetadataWithUserData]";
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                const result: boolean = await verifyDocumentMetadataWithUserData(this.ledgerName, qldbClient, userLedgerMetadata).catch((err) => {
                    throw err
                });

                const endTime: number = new Date().getTime();
                logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)

                return result;
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Gets a document version by Id and Block Sequence Number
     * @param tableName The table name to query.
     * @param {string} documentId An Id of the document, generated by QLDB. Can be retrieved through Utils.getDocumentIds function.
     * @param {ValueHolder} blockAddress A stringified Ion document containing strandId and sequenceNo of a block. E.g.: "{strandId: \"KbW0e2QaN2uBUWzRYGeOCe\", sequenceNo: 21}". Can be retrieved through GetMetadata.lookupBlockAddressAndDocIdForKey
     * @returns An ION document.
     * @throws Error: If error happen during the process.
     */
    async getDocumentVersionByIdAndBlock(tableName: string, documentId: string, blockAddress: ValueHolder): Promise<dom.Value> {
        const fcnName: string = "[QLDBHelper.getDocumentVersionByIdAndBlock]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                const result: dom.Value = await getDocumentRevisionByIdAndBlock(txn, tableName, documentId, blockAddress).catch((err) => {
                    throw err
                });

                const endTime: number = new Date().getTime();
                logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)

                return result;
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    /**
     * Gets all document versions for a specific key
     * @param {string} tableName The name of a table.
     * @param {string} keyAttributeName A keyAttributeName to query.
     * @param {string} keyAttributeValue The key of the given keyAttributeName.
     * @returns An ION document.
     * @throws Error: If error happen during the process.
     */
    async getDocumentHistory(tableName: string, keyAttributeName: string, keyAttributeValue: string): Promise<dom.Value[]> {
        const fcnName: string = "[QLDBHelper.getDocumentRevisionByIdAndBlock]"
        const startTime: number = new Date().getTime();

        try {
            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                const result: dom.Value[] = await getDocumentHistory(txn, tableName, keyAttributeName, keyAttributeValue).catch((err) => {
                    throw err
                });

                const endTime: number = new Date().getTime();
                logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)

                return result;
            })
        } catch (err) {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
            throw new Error(`${fcnName} ${err}`);
        }
    }

    closeSession(): any {
        const fcnName = "[QLDBHelper closeSession]";
        return this.qldbDriver.close();
    }
}