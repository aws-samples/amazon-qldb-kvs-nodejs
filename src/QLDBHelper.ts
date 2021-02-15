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
const { validateTableNameConstrains, validateAttributeNameConstrains } = require('./Util');

import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");
export { LedgerMetadata } from "./GetMetadata"

/**
 * Return an array of table names in UPPER CASE
 * @returns Returns an array of table names in UPPER CASE.
 * @throws Error: If error happen during the process.
 */
export async function listTables(qldbDriver: QldbDriver): Promise<string[]> {
    const fcnName = "[QLDBHelper.listTables]"
    try {
        logger.debug(`${fcnName} Listing table names...`);
        let tableNames: string[] = await qldbDriver.getTableNames();
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
export async function createTableWithIndex(qldbDriver: QldbDriver, tableName: string, keyAttributeName: string): Promise<number> {
    const fcnName = "[QLDBHelper.createTableWithIndex]"
    try {
        //// Listing tables names
        const tableNames: string[] = await listTables(qldbDriver);

        //// Checking if table is already created and create if not
        logger.debug(`${fcnName} Checking if table with name ${tableName} exists`);
        if (tableNames.indexOf(tableName.toUpperCase()) < 0) {
            // Creating table
            return qldbDriver.executeLambda(async (txn: TransactionExecutor) => {
                let resultsTotal = 0;

                validateTableNameConstrains(tableName);
                const statement = `CREATE TABLE ${tableName}`;
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
