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
import { GetDigestCommandOutput, GetRevisionCommandOutput, QLDB } from "@aws-sdk/client-qldb";
import { createTableWithIndex, listTables } from "./QLDBHelper";
import { getByKeyAttribute, getByKeyAttributes, GetDocumentResult } from "./GetDocument"
import { getLedgerDigest } from './GetDigest';
import { getDocumentLedgerMetadata, getDocumentLedgerMetadataByDocIdAndTxId, LedgerMetadata } from "./GetMetadata"
import { getRevision } from "./GetRevision"
import { upsert, UpsertResult } from "./UpsertDocument"
import { getDocumentHistory } from "./GetDocumentHistory"
import { verifyDocumentMetadataWithUserData } from "./VerifyLedgerMetadata"
import { validateRevisionHash } from "./VerifyRevisionHash"

import { log } from "./Logging";
import { createQldbDriver } from "./ConnectToLedger"

import { VALUE_ATTRIBUTE_NAME, KEY_ATTRIBUTE_NAME, DEFAULT_DOWNLOADS_PATH, MAX_QLDB_DOCUMENT_SIZE, TABLE_CREATION_MAX_WAIT } from "./Constants";
import { makeReader, dom, load } from "ion-js";

const qldbClient: QLDB = new QLDB();
const fs = require('fs');
const Util = require('util');
const { sleep, validateTableNameConstrains, validateLedgerNameConstrains } = require('./Util');

const logger = log.getLogger("qldb-kvs");
const mkdir: any = Util.promisify(fs.mkdir);
const writeFile: any = Util.promisify(fs.writeFile);
const readFile: any = Util.promisify(fs.readFile);

export class QLDBKVS {
    qldbDriver: QldbDriver;
    ledgerName: string;
    tableName: string;
    tableState: string;

    /**
     * Initialize QLDBKVS object
     * @param ledgerName A name of QLDB ledger to use
     * @param tableName A name of QLDB table
     * @param checkForTable A boolean value to check table if table exists and create if it is not exests (dafault=true)
     * @param maxConcurrentTransactions The driver internally uses a pool of sessions to execute the transactions.
     *                                  The maxConcurrentTransactions parameter specifies the number of sessions that the driver can hold in the pool.
     * @returns {QLDBKVS} initialized
     */
    constructor(ledgerName: string, tableName: string, checkForTable?: boolean, maxConcurrentTransactions: number = 5) {
        const fcnName = "[QLDBKVS.constructor]";
        try {
            if (!ledgerName) {
                throw new Error(`${fcnName}: Please specify ledgerName`);
            }
            if (!tableName) {
                throw new Error(`${fcnName}: Please specify tableName, which is the name of a table you are planning to use`);
            }

            const checkForTableAndCreate = typeof checkForTable == "boolean" ? checkForTable : true;

            validateLedgerNameConstrains(ledgerName);
            validateTableNameConstrains(tableName);

            this.ledgerName = ledgerName;
            this.tableName = tableName;
            this.tableState = "CHECKING";

            logger.debug(`${fcnName} Creating QLDB driver`);

            this.qldbDriver = createQldbDriver(ledgerName, {}, maxConcurrentTransactions);

            logger.debug(`${fcnName} QLDB driver created`);

            if (checkForTableAndCreate) {
                // Making sure the table exists and set it for creation 
                // next time somebody will decide to submit a new document to QLDB
                (async () => {

                    //// Listing tables names
                    logger.info(`${fcnName} Listing table names...`);
                    let tableNames: string[] = await listTables(this.qldbDriver);
                    tableNames = tableNames.map(x => { return x.toUpperCase() });

                    //// Checking if table is already created and create if not
                    logger.info(`${fcnName} Checking if table with name ${tableName} exists`);
                    if (tableNames.indexOf(tableName.toUpperCase()) >= 0) {
                        this.tableState = "EXIST";
                    } else {
                        this.tableState = "NOT_EXIST";
                    }

                    if (this.tableState === "NOT_EXIST") {
                        this.tableState = "CREATING"
                        logger.info(`${fcnName} Looks like a table with name ${tableName} does not exist. Creating it.`)
                        await createTableWithIndex(this.qldbDriver, tableName, KEY_ATTRIBUTE_NAME);
                        this.tableState = "EXIST";
                        return true
                    }
                })();
            } else {
                this.tableState = "EXIST";
            }
        } catch (err) {
            const msg = `Could not construct an instance of QLDB KVS class`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        }
        return this;
    }

    /**
     * Verify that table exists and create it if it doesn't
     * @param tableName string The name of the table
     * @returns A promise with "true" if table exists
     * @throws Error: If error happen during the process.
     */
    private async assureTableExists(tableName: string): Promise<boolean> {
        const fcnName = "[QLDBKVS.assureTableExists]";
        // In case our table has not been created yet, waiting for it to be created
        let cycles = TABLE_CREATION_MAX_WAIT / 100;
        logger.debug(`${fcnName} Table with name ${tableName} still does not exist, waiting for it to be created.`)
        do {
            await sleep(100);
            cycles--;
            if (this.tableState === "EXIST") {
                return true
            }
            if (cycles === 0) {
                throw new Error(`Could not create a table with name ${tableName} in ${TABLE_CREATION_MAX_WAIT} milliseconds`)
            }
        } while (this.tableState === "CREATING" || this.tableState === "CHECKING");
    }

    /**
     * Download a value as a file to the local file system
     * @param key A value of a key attribute to retrieve the document.
     * @param localFilePath A path on a local file system where to store the result file
     * @returns A promise with a path to a new file, retrieved from QLDB.
     * @throws Error: If error happen during the process.
     */
    async downloadAsFile(key: string, localFilePath: string): Promise<string> {
        const fcnName = "[QLDBKVS.downloadAsFile]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        const filePath: string = localFilePath ? localFilePath : DEFAULT_DOWNLOADS_PATH + key;
        const startTime: number = new Date().getTime();
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!paramId) {
                throw new Error(`${fcnName}: Please specify key`);
            }
            if (!localFilePath) {
                throw new Error(`${fcnName}: Please specify localFilePath`);
            }

            logger.debug(`${fcnName} Getting ${paramId} from ledger ${ledgerName} and table ${tableName} to ${filePath}`);

            if (!localFilePath && !fs.existsSync(DEFAULT_DOWNLOADS_PATH)) {
                await mkdir(DEFAULT_DOWNLOADS_PATH);
            }

            const result: GetDocumentResult[] = await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getByKeyAttribute(txn, tableName, KEY_ATTRIBUTE_NAME, paramId).catch((err) => {
                    throw `Unable to get file By Key Attribute: ${err}`;
                });
            });

            const valueBase64: string = result[0].data.get(VALUE_ATTRIBUTE_NAME).stringValue();
            const valueObject: Buffer = Buffer.from(valueBase64, "base64");

            await writeFile(localFilePath, valueObject);

            return localFilePath;
        } catch (err) {
            //throw `${fcnName}: ${err}`;
            const msg = `Requested document does not exist`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    //Upload a file to s3 key
    /**
     * Upload file to QLDB as utf8 buffer (blob)
     * @param key A value of a key attribute.
     * @param filePath A path to a file on a local file system.
    * @returns A promise with an object containing a document Id and transaction Id
    * @throws Error: If error happen during the process.
     */
    async uploadAsFile(key: string, filePath: string): Promise<UpsertResult> {
        const fcnName = "[QLDBKVS.uploadAsFile]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        const startTime: number = new Date().getTime();
        try {
            if (!paramId) {
                throw new Error(`${fcnName}: Please specify key`);
            }
            if (!filePath) {
                throw new Error(`${fcnName}: Please specify filePath`);
            }
            logger.debug(`${fcnName} Start uploading file ${filePath} to ledger ${ledgerName} and table ${tableName} under the key ${paramId}`);

            const doc: { [k: string]: any } = {};
            doc[KEY_ATTRIBUTE_NAME] = key;
            const fileBuffer = await readFile(filePath);
            doc[VALUE_ATTRIBUTE_NAME] = fileBuffer.toString("base64");

            const documentObjectSize: number = doc[KEY_ATTRIBUTE_NAME].length + doc[VALUE_ATTRIBUTE_NAME].length;

            if (documentObjectSize > MAX_QLDB_DOCUMENT_SIZE) {
                logger.info(`${fcnName} Unable to upload files larger than ${MAX_QLDB_DOCUMENT_SIZE} bytes. Current size: ${documentObjectSize}`);
                return null;
            }
            logger.debug(`${fcnName} Length of an object is ${documentObjectSize}`);

            await this.assureTableExists(tableName);

            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await upsert(txn, tableName, KEY_ATTRIBUTE_NAME, doc).catch((err) => {
                    throw err
                });
            })
        } catch (err) {
            const msg = `Could not upload the file`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
     * Get value for a corresponding key as JSON object
     * @param key A value of a key attribute to retrieve the record from.
     * @param withVersionNumber If true, return the value along with it's version number from the ledger
     * @returns Promise with a value object as JSON.
     */
    async getValue(key: string, withVersionNumber?: boolean): Promise<object | Buffer> {
        const fcnName = "[QLDBKVS.getValue]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        const startTime: number = new Date().getTime();
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object. (Expecting utf8 encoded string)`);

            const result = await this.getValues([key], withVersionNumber);

            const valueObject = result[0];

            if (!valueObject) {
                throw `Requested document does not exist`;
            }

            return valueObject;

        } catch (err) {
            const msg = `Requested document does not exist`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
    * Get values by array of keys
    * @param keys An array of values of key attribute to retrieve the record from.
    * @param withVersionNumbers If true, returns values along with their version numbers from the ledger
    * @returns Promise with an array of value objects as JSON.
    */
    async getValues(keys: string[], withVersionNumbers?: boolean): Promise<object[] | Buffer[]> {
        const fcnName = "[QLDBKVS.getValues]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramIds: string[] = keys;
        const startTime: number = new Date().getTime();
        try {
            if (!paramIds) {
                throw new Error(`${fcnName}: Please specify an array of keys`);
            }

            logger.debug(`${fcnName} Getting ${paramIds} from ledger ${ledgerName} and table ${tableName} into a JSON object. (Expecting utf8 encoded string)`);

            const result: GetDocumentResult[] = await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getByKeyAttributes(txn, tableName, KEY_ATTRIBUTE_NAME, paramIds).catch((err) => {
                    throw `Unable to get key by attributes: ${err}`;
                });
            });

            logger.debug(`${fcnName} Got result: ${JSON.stringify(result)}`);

            if (!result) {
                throw `Requested documents do not exist`;
            }

            const returnObjects = new Array(result.length);

            for (let index = 0; index < result.length; index++) {
                const resultData = result[index].data;

                const valueVersion = result[index].version;
                //const valueObject = resultData.get(VALUE_ATTRIBUTE_NAME).stringValue();
                let returnValue;

                // If we have an attribute value set, we assume the value is a string
                if (resultData.get(VALUE_ATTRIBUTE_NAME)) {
                    returnValue = resultData.get(VALUE_ATTRIBUTE_NAME).stringValue();
                } else {
                    let returnValueTMP: { [k: string]: any }
                    try {
                        returnValueTMP = JSON.parse(JSON.stringify(resultData));
                        delete returnValueTMP[KEY_ATTRIBUTE_NAME];
                    } catch (err) {
                        throw `Unable to convert to JSON an Ion object with key ${resultData.get(KEY_ATTRIBUTE_NAME).stringValue()}: ${err}`;
                    }
                    returnValue = JSON.parse(JSON.stringify(returnValueTMP));

                }

                returnObjects[index] = {
                    // Result order is non-deterministic, hence key is returned
                    key: resultData.get(KEY_ATTRIBUTE_NAME).stringValue(),
                    data: returnValue,
                }

                if (withVersionNumbers) {
                    returnObjects[index].version = valueVersion;
                }

                if (index === result.length - 1) {
                    return returnObjects;
                }
            }
        } catch (err) {
            const msg = `Requested documents do not exist`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
     * Put a JSON object to QLDB as a key/value record
     * @param key A value of a key attribute to save the record with.
     * @param value A value of a value attribute to save the record with. If it's not a string, it will be converted to Amazon Ion before submitting to the ledger.
     * @param  version number (OPTIONAL) The versions of the document to make sure we update the right version. Function will return an error if the most recent version in the ledger is different.
     * @returns A promise with an object containing a document Id and transaction Id
     */
    async setValue(key: string, value: any, version?: number): Promise<UpsertResult> {
        const fcnName = "[QLDBKVS.setValue]";
        const self: QLDBKVS = this;
        const startTime: number = new Date().getTime();

        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }
            if (!value) {
                throw new Error(`${fcnName}: Please specify a value`);
            }

            const upsertResult = await this.setValues([key], [value], [version]);
            return upsertResult[0];

        } catch (err) {
            const msg = `Could not set the value`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
     * Put a JSON object to QLDB as a key/value record
     * @param keys String[] An array of key attributes to save the records with.
     * @param values any [] An array of values of a value attributes to save the records with. If they are not a string, they will be converted to Amazon Ion before submitting to the ledger.
     * @param  versions number [] (OPTIONAL) An array of the versions of the documents to make sure we update the right version. Function will return an error if the most recent version in the ledger is different.
     * @returns A promise with an object containing a document Id and transaction Id
     */
    async setValues(keys: string[], values: any[], versions?: number[]): Promise<UpsertResult[]> {
        const fcnName = "[QLDBKVS.setValues]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const startTime: number = new Date().getTime();

        try {
            if (keys.length < 1) {
                throw new Error(`${fcnName}: Please specify at least one key`);
            }
            if (keys.length > 10) {
                throw new Error(`${fcnName}: Unable to submit more than 10 values at a time`);
            }
            if (values.length < 1) {
                throw new Error(`${fcnName}: Please specify at least one value`);
            }
            if (keys.length !== values.length) {
                throw new Error(`${fcnName}: Please make sure the number of keys equals the number of values`);
            }
            if (versions && (values.length !== versions.length)) {
                throw new Error(`${fcnName}: Please make sure the number of versions equals the number of values`);
            }

            const documentsArray: { [k: string]: any }[] = keys.map((key, index) => {

                let document: { [k: string]: any } = {};


                if (typeof values[index] == "string") {
                    document[KEY_ATTRIBUTE_NAME] = key
                    document[VALUE_ATTRIBUTE_NAME] = values[index];
                } else {
                    // Making sure we copy the object and will not modify it
                    document = Object.assign({}, values[index]);
                    document[KEY_ATTRIBUTE_NAME] = key
                }

                logger.debug(`${fcnName} Setting value of ${key} from ledger ${ledgerName} and table ${tableName} as utf8 encoded stringified JSON object.`);
                return document
            })

            // In case our table has not been created yet, waiting for it to be created
            await this.assureTableExists(tableName);

            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await Promise.all(documentsArray.map((document, index) => {
                    const version = versions ? versions[index] : null;
                    return upsert(txn, tableName, KEY_ATTRIBUTE_NAME, document, version).catch((err) => {
                        throw err
                    });
                }));
            })

        } catch (err) {
            const msg = `Could not set values`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
     * Get most recent metadata for a corresponding key as JSON object
     * @param key A value of a key attribute to retrieve the record from.
     * @param transactionId A transaction Id for the version of the document you would like to retrieve (optional).
     * @returns Promise with a value object as JSON.
     */
    async getMetadata(key: string): Promise<LedgerMetadata> {
        const fcnName = "[QLDBKVS.getMetadata]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        const startTime: number = new Date().getTime();
        try {
            if (!paramId) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting metadata for ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: LedgerMetadata = await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getDocumentLedgerMetadata(txn, this.ledgerName, tableName, KEY_ATTRIBUTE_NAME, paramId, qldbClient).catch((err) => {
                    throw err
                });
            })

            if (!result) {
                throw `Requested document does not exist`;
            }

            return result;

        } catch (err) {
            const msg = `Could not get metadata`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }
    }

    /**
     * Get the metadata for a specific documentId and transactionId as JSON object
     * @param documentId A document Id generated by the QLDB service.
     * @param transactionId A transaction Id for the version of the document you would like to retrieve (optional).
     * @returns Promise with a value object as JSON.
     */
    async getMetadataByDocIdAndTxId(documentId: string, transactionId: string): Promise<LedgerMetadata> {
        const fcnName = "[QLDBKVS.getMetadataByDocIdAndTxId]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const startTime: number = new Date().getTime();
        try {

            logger.debug(`${fcnName} Getting metadata for document id: ${documentId} and transaction id: ${transactionId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: LedgerMetadata = await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getDocumentLedgerMetadataByDocIdAndTxId(txn, this.ledgerName, tableName, documentId, transactionId, qldbClient).catch((err) => {
                    throw err
                });
            })

            if (!result) {
                throw `Requested document does not exist`;
            }

            return result;

        } catch (err) {
            const msg = `Could not get metadata`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }
    }

    /**
     * Get complete history of a document, associated with the certain key
     * @param {string} key A value of a key attribute to retrieve the record from.
     * @param {string} fromDateISO OPTIONAL String, containing a from date and time  in ISO format like `2019-06-05T00:00:00Z` to query revisions history from.
     * @param {string} toDateISO OPTIONAL String, containing a to date and time in ISO format like `2019-06-05T00:00:00Z` to query revisions history to.
     * @returns Promise with an array of documents as JSON.
     */
    async getHistory(key: string, fromDateISO?: string, toDateISO?: string): Promise<object[]> {
        const fcnName = "[QLDBKVS.getHistory]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        const startTime: number = new Date().getTime();
        try {
            if (!paramId) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting history for ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: object[] = await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await getDocumentHistory(txn, tableName, KEY_ATTRIBUTE_NAME, paramId, fromDateISO, toDateISO).catch((err) => {
                    throw err
                });
            })

            if (!result) {
                throw `Requested document does not exist`;
            }

            return result;

        } catch (err) {
            const msg = `Could not get history`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }

    }

    /**
     * Get value for a corresponding key as JSON object
     * @param {LedgerMetadata}  ledgerMetadata is an object that holds ledger metadata returned by function "getMetadata(key)"
     * @returns Promise with a boolean
     */
    async verifyLedgerMetadata(ledgerMetadata: LedgerMetadata): Promise<boolean> {
        const fcnName = "[QLDBKVS.verifyLedgerMetadata]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const startTime: number = new Date().getTime();
        try {

            logger.debug(`${fcnName} Verifying metadata for ${ledgerMetadata.DocumentId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            return await this.qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                return await verifyDocumentMetadataWithUserData(this.ledgerName, qldbClient, ledgerMetadata).catch((err) => {
                    throw err
                });
            })

        } catch (err) {
            const msg = `Could not verify the metadta`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }
    }

    /**
     * Get document revision by metadata
     * @param {LedgerMetadata}  ledgerMetadata is an object that holds ledger metadata returned by function "getMetadata(key)"
     * @returns Document with document revision
     */
    async getDocumentRevisionByLedgerMetadata(ledgerMetadata: LedgerMetadata): Promise<any> {
        const fcnName = "[QLDBKVS.getDocumentRevisionByLedgerMetadata]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const startTime: number = new Date().getTime();
        try {

            logger.debug(`${fcnName} Retrieving document revision by metadata ${ledgerMetadata.DocumentId} from ledger ${ledgerName}`);

            const revisionResponse: GetRevisionCommandOutput = await getRevision(ledgerName,
                ledgerMetadata.DocumentId,
                ledgerMetadata.BlockAddress,
                ledgerMetadata.LedgerDigest.DigestTipAddress,
                qldbClient)
            const ionReader = makeReader(revisionResponse.Revision.IonText);
            return load(ionReader);
            //return revisionResponse.Revision.IonText;
        } catch (err) {
            const msg = `Could not get document revision`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }
    }

    /**
     * Verify document revision hash
     * @param {JSON}  documentRevision is an object that holds document revision returned by function "getDocumentRevisionByLedgerMetadata(ledgerMetadata)" or "getHistory(key)"
     * @returns Document with document revision
     */
    verifyDocumentRevisionHash(documentRevision: any): boolean {
        const fcnName = "[QLDBKVS.verifyDocumentRevisionHash]";
        const startTime: number = new Date().getTime();
        try {
            return validateRevisionHash(documentRevision);
        } catch (err) {
            const msg = `Could not verify document revision hash`;
            logger.error(`${fcnName} ${msg}: ${err}`);
            throw new Error(msg);
        } finally {
            const endTime: number = new Date().getTime();
            logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        }
    }

    /**
     * Gets the most recent ledger digest.
     * @returns A JSON document with ledger digest.
     * @param ledgerName A name of the ledger
     * @throws Error: If error happen during the process.
     */
    async getLedgerDigest(ledgerName: string, qldbClient: QLDB): Promise<GetDigestCommandOutput> {
        const fcnName = "[QLDBHelper.getLedgerDigest]"
        return getLedgerDigest(ledgerName, qldbClient);
    }
}