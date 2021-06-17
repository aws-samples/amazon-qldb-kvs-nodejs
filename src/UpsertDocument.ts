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
import { getDocumentIdsAndVersions, GetDocIdAndVersionResult } from "./GetDocument"
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
export async function upsert(txn: TransactionExecutor, tableName: string, keyAttributeName: string, documentJSON: object, version?: number): Promise<UpsertResult> {
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
        let docIdsAndVersions: GetDocIdAndVersionResult[] = [];

        try {
            docIdsAndVersions = await getDocumentIdsAndVersions(txn, tableName, keyAttributeName, documentJSONKeyValue);
        } catch (err) {
            logger.debug(`${fcnName} Unable to find a document. So assuming we are inserting a new document.`);
        }

        // If multiple, return an error
        if (docIdsAndVersions.length > 1) {
            throw `More than one document found with ${keyAttributeName} = ${documentJSONKeyValue}. Found ids and versions: ${JSON.stringify(docIdsAndVersions)}`
        }

        // Preparing request statement and parameters
        let statement = "";

        let result: Result

        // If exists, update the doc
        if (docIdsAndVersions.length == 1) {
            logger.debug(`${fcnName} Document exists, updating.`);
            const documentId: string = docIdsAndVersions[0].id;
            const documentVersion: number = docIdsAndVersions[0].version;
            if (version && (version !== documentVersion)) {
                throw new Error(`Expected version number ${version} does not equal ${documentVersion} the latest version number in the ledger `);
            }
            // Just to be 100% sure we are updating a right document in deterministic way
            validateTableNameConstrains(tableName);
            statement = `UPDATE ${tableName} AS d BY id SET d = ? WHERE id = ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON, documentId);
        }

        // If not exists, insert a new doc
        if (docIdsAndVersions.length == 0) {
            logger.debug(`${fcnName} Document does not exist yet, inserting a new one.`);
            validateTableNameConstrains(tableName);
            statement = `INSERT INTO ${tableName} ?`;
            logger.debug(`${fcnName} Executing statement ${statement}`);
            result = await txn.execute(statement, documentJSON);
        }

        logger.info(`${fcnName} Document with key "${documentJSONKeyValue}" is added to the table with name "${tableName}"`);
        logger.debug(`${fcnName} Returned results list: ${result.getResultList()}`);
        const finalResult: UpsertResult[] = result.getResultList().map((returnObject) => {
            return {
                documentId: returnObject.get("documentId").stringValue(),
                txId: txId
            }
        });
        return finalResult[0];
    } catch (err) {
        throw `${fcnName} ${err}`;
    } finally {
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
    }
}