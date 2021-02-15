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

import { TransactionExecutor, Result } from "amazon-qldb-driver-nodejs";
import { validateTableNameConstrains } from "./Util"
import { getDocumentIds } from "./GetDocument"
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");

export class UpsertResult {
    documentId: string;
    txId: string;
}

/**
* Updates or inserts a new document, using keyAttributeName to hold a unique key.
* @param txn The {@linkcode TransactionExecutor} for lambda execute.
* @param tableName The name of a table.
* @param keyAttributeName The name of an attribute for indexing.
* @param documentJSON Document to add to the table. Should contain an attribute with the name "keyAttributeName".
* @returns A number of changes made to the ledger.
* @throws Error: If error happen during the process.
*/
export async function upsert(txn: TransactionExecutor, tableName: string, keyAttributeName: string, documentJSON: object): Promise<UpsertResult[]> {
    const fcnName = "[UpsertDocument.upsert]"
    const startTime: number = new Date().getTime();
    const txId = txn.getTransactionId();
    try {
        // Retrieve document id by key value
        let documentJSONKeyValue = "";
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
        let statement = "";

        let result: Result

        // If exists, update the doc
        if (docIds.length == 1) {
            logger.debug(`${fcnName} Document exists, updating.`);
            const documentId: string = docIds[0];
            //statement = `UPDATE ${tableName} AS d SET d = ? WHERE d.${keyAttributeName} = ?`;
            // Just to be 100% sure we are updating a right document in deterministic way
            validateTableNameConstrains(tableName);
            statement = `UPDATE ${tableName} AS d BY id SET d = ? WHERE id = ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON, documentId);
        }

        // If not exists, insert a new doc
        if (docIds.length == 0) {
            logger.debug(`${fcnName} Document does not exist yet, inserting a new one.`);
            validateTableNameConstrains(tableName);
            statement = `INSERT INTO ${tableName} ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON);
        }

        logger.info(`${fcnName} Document with key "${documentJSONKeyValue}" is added to the table with name "${tableName}"`);
        logger.debug(`${fcnName} Returned results list: ${result.getResultList()}`);
        return result.getResultList().map((returnObject) => {
            return {
                documentId: returnObject.get("documentId").stringValue(),
                txId: txId
            }
        });
    } catch (err) {
        throw `${fcnName} ${err}`;
    } finally {
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
    }
}