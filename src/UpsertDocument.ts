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

import { TransactionExecutor, Result } from "amazon-qldb-driver-nodejs";
import { getDocumentIds } from "./Util"
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");

/**
* Updates or inserts a new document, using keyAttributeName to hold a unique key.
* @param txn The {@linkcode TransactionExecutor} for lambda execute.
* @param tableName The name of a table.
* @param keyAttributeName The name of an attribute for indexing.
* @param documentJSON Document to add to the table. Should contain an attribute with the name "keyAttributeName".
* @returns A number of changes made to the ledger.
* @throws Error: If error happen during the process.
*/
export async function upsert(txn: TransactionExecutor, tableName: string, keyAttributeName: string, documentJSON: object): Promise<number> {
    const fcnName: string = "[UpsertDocument.upsert]"
    const startTime: number = new Date().getTime();
    try {
        // Retrieve document id by key value
        let documentJSONKeyValue: string = "";
        if (keyAttributeName in documentJSON) {
            documentJSONKeyValue = documentJSON[keyAttributeName as keyof typeof documentJSON];
        } else {
            throw `Attribute with name ${keyAttributeName} does not exist in document passed: ${JSON.stringify(documentJSON)}`
        }
        let docIds: string[] = [];

        try {
            docIds = await getDocumentIds(txn, tableName, keyAttributeName, documentJSONKeyValue);
        } catch (err) {
            logger.debug(`${fcnName} Didn't find a doc. So assuming we are inserting a new doc.`);
        }

        // If multiple, return an error
        if (docIds.length > 1) {
            throw `More than one document found with ${keyAttributeName} = ${documentJSONKeyValue}. Found ids: ${docIds}`
        }

        // Preparing request statement and parameters
        let statement: string = "";

        let result: Result

        // If exists, update the doc
        if (docIds.length == 1) {
            logger.debug(`${fcnName} Document exists, updating.`);
            const documentId: string = docIds[0];
            //statement = `UPDATE ${tableName} AS d SET d = ? WHERE d.${keyAttributeName} = ?`;
            // Just to be 100% sure we are updating a right document in deterministic way
            statement = `UPDATE ${tableName} AS d BY id SET d = ? WHERE id = ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON, documentId);
        }

        // If not exists, insert a new doc
        if (docIds.length == 0) {
            logger.debug(`${fcnName} Document does not exist yet, inserting a new one.`);
            statement = `INSERT INTO ${tableName} ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON);
        }

        logger.info(`${fcnName} Document with key "${documentJSONKeyValue}" is added to the table with name "${tableName}"`);
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        return result.getResultList().length;
    } catch (err) {
        throw `${fcnName} ${err}`;
    }
}