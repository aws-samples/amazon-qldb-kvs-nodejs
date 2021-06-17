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
import { dom } from "ion-js";
import { log } from "./Logging";
import { MAX_KEYS_TO_RETRIEVE } from "./Constants";
import { validateTableNameConstrains, validateAttributeNameConstrains } from "./Util"
const logger = log.getLogger("qldb-helper");

export interface GetDocIdAndVersionResult {
    id: string
    version: number
}

export interface GetDocumentResult {
    data: dom.Value
    version: number
}

function prepareGetDocumentResult(resultList: dom.Value[]): GetDocumentResult[] {
    return resultList.map((dataWithVersion) => {
        return {
            data: dataWithVersion.get("data"),
            version: dataWithVersion.get("version").numberValue()
        }
    });
}

/**
 * Generates parameter string for queries with many similar params.
 * @param numberOfParams Number of ? characters in query.
 * @returns A paramter string formatted similar to [?, ?, ?].
 */
function getBindParametersString(numberOfParams: number): String {
    let paramStr = "["
    for (let i = 0; i < numberOfParams; i++) {
        if (i == (numberOfParams - 1)) {
            //Handle the last element
            paramStr += "?]"
        } else {
            //everything else
            paramStr += "?, "
        }
    }
    return paramStr;
}

/**
 * Gets a document by the value of one attribute.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param tableName The name of a table.
 * @param keyAttributeName The name of an attribute for indexing.
 * @param keyAttributeValue A value of a key attribute.
 * @returns Array of results as ION documents.
 * @throws Error: If error happen during the process.
 */
export async function getByKeyAttribute(txn: TransactionExecutor, tableName: string, keyAttributeName: string, keyAttributeValue: string): Promise<GetDocumentResult[]> {
    const fcnName = "[GetDocument.getByKeyAttribute]"
    const startTime: number = new Date().getTime();

    try {
        validateTableNameConstrains(tableName);
        validateAttributeNameConstrains(keyAttributeName);
        const query = `SELECT data, metadata.version FROM _ql_committed_${tableName} AS d  WHERE d.data.${keyAttributeName} = ?`;

        logger.debug(`${fcnName} Retrieving document values for Key: ${keyAttributeValue}`);
        logger.debug(`${fcnName} Query statement: ${query}`);

        const result: Result = await txn.execute(query, keyAttributeValue)
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        const resultList: dom.Value[] = result.getResultList();
        if (resultList.length === 0) {
            throw `${fcnName} Unable to find document with Key: ${keyAttributeValue}.`;
        }
        return prepareGetDocumentResult(resultList);
    } catch (err) {
        const endTime: number = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        throw err;
    }
}

/**
 * Gets a document by the value of one attribute.
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param tableName The name of a table.
 * @param keyAttributeName The name of an attribute for indexing.
 * @param keyAttributeValues An array of values of key attribute.
 * @returns Array of results as ION documents.
 * @throws Error: If error happen during the process.
 */
export async function getByKeyAttributes(txn: TransactionExecutor, tableName: string, keyAttributeName: string, keyAttributeValues: string[]): Promise<GetDocumentResult[]> {
    const fcnName = "[GetDocument.getByKeyAttributes]"
    const startTime: number = new Date().getTime();

    try {

        validateTableNameConstrains(tableName);
        validateAttributeNameConstrains(keyAttributeName);
        const query = `SELECT data, metadata.version FROM _ql_committed_${tableName} AS d WHERE d.data.${keyAttributeName} IN ${getBindParametersString(keyAttributeValues.length)}`;

        if (keyAttributeValues.length > MAX_KEYS_TO_RETRIEVE) throw `Maximum number of keys (${MAX_KEYS_TO_RETRIEVE}) exceeded.`

        logger.debug(`${fcnName} Retrieving document values for Keys: ${keyAttributeValues}`);
        logger.debug(`${fcnName} Query statement: ${query}`);

        const result: Result = await txn.execute(query, ...keyAttributeValues)
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        const resultList: dom.Value[] = result.getResultList();
        if (resultList.length === 0) {
            throw `${fcnName} Unable to find documents with keys: ${keyAttributeValues}.`;
        }
        return prepareGetDocumentResult(resultList);
    } catch (err) {
        const endTime: number = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        throw err;
    }
}

/**
 * Gets a document by QLDB Document Id
 * @param txn The {@linkcode TransactionExecutor} for lambda execute.
 * @param tableName The name of a table.
 * @param documentId Document Id string.
 * @returns Array of results as ION documents.
 * @throws Error: If error happen during the process.
 */
export async function getDocumentById(txn: TransactionExecutor, tableName: string, documentId: string): Promise<GetDocumentResult[]> {
    const fcnName = "[GetDocument.getDocumentById]"
    const startTime: number = new Date().getTime();

    try {
        validateTableNameConstrains(tableName);
        const query = `SELECT data, metadata.version FROM _ql_committed_${tableName}  WHERE metadata.id = ?`;

        logger.debug(`${fcnName} Retrieving document with Id: ${documentId}`);
        logger.debug(`${fcnName} Query statement: ${query}`);

        const result: Result = await txn.execute(query, documentId);
        const endTime = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        const resultList: dom.Value[] = result.getResultList();
        if (resultList.length === 0) {
            throw `${fcnName} Unable to find document Id: ${documentId}.`;
        }
        return prepareGetDocumentResult(resultList);
    } catch (err) {
        const endTime: number = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        throw err;
    }
}
/**
* Get the document IDs from the given table.
* @param txn The {@linkcode TransactionExecutor} for lambda execute.
* @param tableName The table name to query.
* @param keyAttributeName A keyAttributeName to query.
* @param keyAttributeValue The key of the given keyAttributeName.
* @returns Promise which fulfills with the document ID as a string.
*/
export async function getDocumentIdsAndVersions(
    txn: TransactionExecutor,
    tableName: string,
    keyAttributeName: string,
    keyAttributeValue: string
): Promise<GetDocIdAndVersionResult[]> {
    const fcnName = "[GetDocument.getDocumentIdsAndVersions]"
    const startTime: number = new Date().getTime();

    validateTableNameConstrains(tableName);
    validateAttributeNameConstrains(keyAttributeName);
    const query = `SELECT metadata.id, metadata.version FROM _ql_committed_${tableName} AS t BY id WHERE t.data.${keyAttributeName} = ?`;
    let documentIds: GetDocIdAndVersionResult[] = [];

    try {
        const result: Result = await txn.execute(query, keyAttributeValue);
        const resultList: dom.Value[] = result.getResultList();
        if (resultList.length === 0) {
            throw `Unable to retrieve document ID using ${keyAttributeValue}.`
        }

        resultList.forEach(async (result, index) => {
            let id: string = resultList[index].get("id").stringValue();
            let version: number = resultList[index].get("version").numberValue();
            documentIds.push({
                id: id,
                version: version
            });
        })
        return documentIds;
    } catch (err) {
        const endTime: number = new Date().getTime();
        logger.debug(`${fcnName} Execution time: ${endTime - startTime}ms`)
        throw new Error(`${fcnName} ${err}`);
    }

}