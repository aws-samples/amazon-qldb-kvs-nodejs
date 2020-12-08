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

import { QLDBHelper, LedgerMetadata } from "./QLDBHelper";
import { log } from "./Logging";
const logger = log.getLogger("qldb-kvs");

import { VALUE_ATTRIBUTE_NAME, KEY_ATTRIBUTE_NAME, DEFAULT_DOWNLOADS_PATH, MAX_QLDB_DOCUMENT_SIZE } from "./Constants";

const fs = require('fs');
const Util = require('util');
const { sleep, validateTableNameConstrains, validateLedgerNameConstrains } = require('./Util');

const mkdir: any = Util.promisify(fs.mkdir);
const writeFile: any = Util.promisify(fs.writeFile);
const readFile: any = Util.promisify(fs.readFile);

// Waiting for table creation for 30 seconds before throwing an error
const TABLE_CREATION_MAX_WAIT = 30000

export class QLDBKVS {
    qldbHelper: QLDBHelper;
    ledgerName: string;
    tableName: string;
    tableState: string;

    /**
     * Initialize QLDBKVS object
     * @param ledgerName A name of QLDB ledger to use
     * @param tableName A name of QLDB table
     * @returns {QLDBKVS} initialized
     */
    constructor(ledgerName: string, tableName: string) {
        const fcnName: string = "[QLDBKVS.constructor]";
        try {
            if (!ledgerName) {
                throw new Error(`${fcnName}: Please specify ledgerName`);
            }
            if (!tableName) {
                throw new Error(`${fcnName}: Please specify tableName, which is the name of a table you are planning to use`);
            }

            validateLedgerNameConstrains(ledgerName);
            validateTableNameConstrains(tableName);

            this.ledgerName = ledgerName;
            this.tableName = tableName;
            this.qldbHelper = new QLDBHelper(ledgerName);
            this.tableState = "NOT_EXIST";
            // Making sure the table exists and set it for creation 
            // next time somebody will decide to submit a new document to QLDB
            (async () => {

                //// Listing tables names
                logger.info(`${fcnName} Listing table names...`);
                let tableNames: string[] = await this.qldbHelper.listTables();
                tableNames = tableNames.map(x => { return x.toUpperCase() });

                //// Checking if table is already created and create if not
                logger.info(`${fcnName} Checking if table with name ${tableName} exists`);
                if (tableNames.indexOf(tableName.toUpperCase()) >= 0) {
                    this.tableState = "EXIST";
                }
            })();
        } catch (err) {
            throw new Error(`${fcnName} ${err}`)
        }
        return this;
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
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify key`);
            }
            if (!localFilePath) {
                throw new Error(`${fcnName}: Please specify localFilePath`);
            }

            logger.debug(`${fcnName} Getting ${paramId} from ledger ${ledgerName} and table ${tableName} to ${filePath}`);

            if (!localFilePath) {
                if (!fs.existsSync(DEFAULT_DOWNLOADS_PATH)) {
                    await mkdir(DEFAULT_DOWNLOADS_PATH);
                }
            }

            const resultION = await this.qldbHelper.getDocumentByKeyAttribute(tableName, KEY_ATTRIBUTE_NAME, key);

            const valueBase64: string = resultION[0].get(VALUE_ATTRIBUTE_NAME).stringValue();
            const valueObject: Buffer = Buffer.from(valueBase64, "base64");

            await writeFile(localFilePath, valueObject);

            return localFilePath;
        } catch (err) {
            //throw `${fcnName}: ${err}`;
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }

    //Upload a file to s3 key
    /**
     * Upload file to QLDB as utf8 buffer (blob)
     * @param key A value of a key attribute.
     * @param filePath A path to a file on a local file system.
    * @returns A promise with document Id.
    * @throws Error: If error happen during the process.
     */
    async uploadAsFile(key: string, filePath: string): Promise<string> {
        const fcnName = "[QLDBKVS.uploadAsFile]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify key`);
            }
            if (!filePath) {
                throw new Error(`${fcnName}: Please specify filePath`);
            }
            logger.debug(`${fcnName} Start uploading file ${filePath} to ledger ${ledgerName} and table ${tableName} under the key ${paramId}`);

            let document: { [k: string]: any } = {};
            document[KEY_ATTRIBUTE_NAME] = key;
            const fileBuffer = await readFile(filePath);
            document[VALUE_ATTRIBUTE_NAME] = fileBuffer.toString("base64");

            const documentObjectSize: number = document[KEY_ATTRIBUTE_NAME].length + document[VALUE_ATTRIBUTE_NAME].length;

            if (documentObjectSize > MAX_QLDB_DOCUMENT_SIZE) {
                logger.info(`${fcnName} Can't upload files larger than ${MAX_QLDB_DOCUMENT_SIZE} bytes. Current size: ${documentObjectSize}`);
                return null;
            }
            logger.debug(`${fcnName} Length of an object is ${documentObjectSize}`);

            // In case our table has not been created yet, waiting for it to be created
            if (this.tableState === "CREATING") {
                let cycles = TABLE_CREATION_MAX_WAIT / 100;
                logger.debug(`${fcnName} Table with name ${tableName} still does not exist, waiting for it to be created.`)
                do {
                    await sleep(100);
                    cycles--;
                    if (cycles === 0) {
                        throw new Error(`Could not create a table with name ${tableName} in ${TABLE_CREATION_MAX_WAIT} milliseconds`)
                    }
                } while (this.tableState === "CREATING");
            }
            if (this.tableState === "NOT_EXIST") {
                this.tableState = "CREATING"
                logger.info(`${fcnName} Looks like a table with name ${tableName} doesn't exist. Creating it and re-trying file upload.`)
                await this.qldbHelper.createTableWithIndex(tableName, KEY_ATTRIBUTE_NAME);
                this.tableState = "EXIST";
            }
            const result: number = await this.qldbHelper.upsertDocumentWithKeyAttribute(tableName, KEY_ATTRIBUTE_NAME, document).catch((err) => {
                throw err;
            });
            const documentIds = await this.qldbHelper.getDocumentIds(tableName, KEY_ATTRIBUTE_NAME, key);
            return documentIds[0];
        } catch (err) {
            const msg: string = `${fcnName} Could not upload the file: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }

    /**
     * Get value for a corresponding key as JSON object
     * @param key A value of a key attribute to retrieve the record from.
     * @returns Promise with a value object as JSON.
     */
    async getValue(key: string): Promise<object | Buffer> {
        const fcnName = "[QLDBKVS.getValue]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object. (Expecting utf8 encoded string)`);

            const resultION = await this.qldbHelper.getDocumentByKeyAttribute(tableName, KEY_ATTRIBUTE_NAME, key).catch((err) => {
                throw err;
            });

            const valueObject = resultION[0].get(VALUE_ATTRIBUTE_NAME).stringValue();

            if (!valueObject) {
                throw `Requested record does not exist`;
            }

            let returnValue;
            try {
                returnValue = JSON.parse(valueObject)
            } catch (err) {
                returnValue = valueObject
            }
            return returnValue;

        } catch (err) {
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.debug(msg);
            throw new Error(msg);
        }

    }

    /**
 * Get values by array of keys
 * @param keys An array of values of key attribute to retrieve the record from.
 * @returns Promise with an array of value objects as JSON.
 */
    async getValues(keys: string[]): Promise<object[] | Buffer[]> {
        const fcnName = "[QLDBKVS.getValues]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramIds: string[] = keys;
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!keys) {
                throw new Error(`${fcnName}: Please specify an array of keys`);
            }

            logger.debug(`${fcnName} Getting ${paramIds} from ledger ${ledgerName} and table ${tableName} into a JSON object. (Expecting utf8 encoded string)`);

            const resultION = await this.qldbHelper.getDocumentByKeyAttributes(tableName, KEY_ATTRIBUTE_NAME, keys).catch((err) => {
                throw err;
            });

            logger.debug(`${fcnName} Got result: ${JSON.stringify(resultION)}`);

            if (!resultION) {
                throw `Requested record does not exist`;
            }

            let valueObjects = new Array(resultION.length);

            for (let index = 0; index < resultION.length; index++) {
                const result = resultION[index];
                const valueObject = result.get(VALUE_ATTRIBUTE_NAME).stringValue();
                try {
                    valueObjects[index] = JSON.parse(valueObject)
                } catch (err) {
                    valueObjects[index] = valueObject
                }
                if (index === resultION.length - 1) {
                    return valueObjects;
                }
            }
        } catch (err) {
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.debug(msg);
            throw new Error(msg);
        }

    }

    /**
     * Put a JSON object to QLDB as a key/value record
     * @param key A value of a key attribute to save the record with.
     * @param value A value of a value attribute to save the record with. If it's not a string, it will be stringified before submitting to the ledger.
     * @returns A promise with a new document Id.
     */
    async setValue(key: string, value: any): Promise<string> {
        const fcnName = "[QLDBKVS.setValue]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        //const qldbHelper: QLDBHelper = this.qldbHelper;

        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }
            if (!value) {
                throw new Error(`${fcnName}: Please specify a value`);
            }

            let valueAsString = value;

            if (typeof value !== "string") {
                try {
                    valueAsString = JSON.stringify(value);
                } catch (err) {
                    throw new Error(`${fcnName} Could not parse submitted value [${value}] to JSON: ${err}`);
                }
            }

            let document: { [k: string]: any } = {};
            document[KEY_ATTRIBUTE_NAME] = key
            document[VALUE_ATTRIBUTE_NAME] = valueAsString

            logger.debug(`${fcnName} Setting value of ${paramId} from ledger ${ledgerName} and table ${tableName} as utf8 encoded stringified JSON object.`);

            // In case our table has not been created yet, waiting for it to be created
            if (this.tableState === "CREATING") {
                let cycles = TABLE_CREATION_MAX_WAIT / 100;
                logger.debug(`${fcnName} Table with name ${tableName} still does not exist, waiting for it to be created.`)
                do {
                    await sleep(100);
                    cycles--;
                    if (cycles === 0) {
                        throw new Error(`Could not create a table with name ${tableName} in ${TABLE_CREATION_MAX_WAIT} milliseconds`)
                    }
                } while (this.tableState === "CREATING");
            }

            if (this.tableState === "NOT_EXIST") {
                this.tableState = "CREATING"
                logger.info(`${fcnName} Looks like a table with name ${tableName} doesn't exist. Creating it and re-trying file upload.`)
                await this.qldbHelper.createTableWithIndex(tableName, KEY_ATTRIBUTE_NAME);
                this.tableState = "EXIST";
            }

            const result: number = await this.qldbHelper.upsertDocumentWithKeyAttribute(tableName, KEY_ATTRIBUTE_NAME, document).catch((err) => {
                throw err;
            });
            const documentIds = await this.qldbHelper.getDocumentIds(tableName, KEY_ATTRIBUTE_NAME, key);
            return documentIds[0];

        } catch (err) {
            const msg: string = `${fcnName} Could not set the value: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }

    /**
     * Get value for a corresponding key as JSON object
     * @param key A value of a key attribute to retrieve the record from.
     * @returns Promise with a value object as JSON.
     */
    async getMetadata(key: string): Promise<LedgerMetadata> {
        const fcnName = "[QLDBKVS.getMetadata]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting metadata for ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: LedgerMetadata = await this.qldbHelper.getDocumentLedgerMetadata(tableName, KEY_ATTRIBUTE_NAME, key).catch((err) => {
                throw err;
            });

            if (!result) {
                throw `Requested record does not exist`;
            }

            return result;

        } catch (err) {
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }

    /**
     * Get complete history of a document, associated with the certain key
     * @param key A value of a key attribute to retrieve the record from.
     * @returns Promise with an array of documents as JSON.
     */
    async getHistory(key: string): Promise<object[]> {
        const fcnName = "[QLDBKVS.getHistory]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        const paramId: string = key;
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {
            if (!key) {
                throw new Error(`${fcnName}: Please specify a key`);
            }

            logger.debug(`${fcnName} Getting history for ${paramId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: object[] = await this.qldbHelper.getDocumentHistory(tableName, KEY_ATTRIBUTE_NAME, key).catch((err) => {
                throw err;
            });

            if (!result) {
                throw `Requested record does not exist`;
            }

            return result;

        } catch (err) {
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }

    /**
     * Get value for a corresponding key as JSON object
     * @param {LedgerMetadata}  ledgerMetadata is an object that holds ledger metadata returned by function "getMetadata(key)"
     * @returns Promise with a boolean
     */
    async verifyMetadata(ledgerMetadata: LedgerMetadata): Promise<boolean> {
        const fcnName = "[QLDBKVS.verifyMetadata]";
        const self: QLDBKVS = this;
        const ledgerName: string = self.ledgerName;
        const tableName: string = self.tableName;
        //const qldbHelper: QLDBHelper = this.qldbHelper;
        try {

            logger.debug(`${fcnName} Verifying metadata for ${ledgerMetadata.DocumentId} from ledger ${ledgerName} and table ${tableName} into a JSON object`);

            const result: boolean = await this.qldbHelper.verifyDocumentMetadataWithUserData(ledgerMetadata).catch((err) => {
                throw err;
            });

            return result;

        } catch (err) {
            const msg: string = `${fcnName} Requested record does not exist: ${err}`;
            logger.error(msg);
            throw new Error(msg);
        }

    }
}