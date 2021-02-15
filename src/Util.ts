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

import { GetBlockResponse, GetDigestResponse, ValueHolder } from "aws-sdk/clients/qldb";
import {
    decodeUtf8,
    dom,
    IonTypes,
    makePrettyWriter,
    makeReader,
    Reader,
    toBase64,
    Writer
} from "ion-js";

import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");

export type Base64EncodedString = string;

/**
 * Returns the string representation of a given BlockResponse.
 * @param blockResponse The BlockResponse to convert to string.
 * @returns The string representation of the supplied BlockResponse.
 */
export function blockResponseToString(blockResponse: GetBlockResponse): string {
    let stringBuilder = "";
    if (blockResponse.Block.IonText) {
        stringBuilder = stringBuilder + "Block: " + blockResponse.Block.IonText + ", ";
    }
    if (blockResponse.Proof.IonText) {
        stringBuilder = stringBuilder + "Proof: " + blockResponse.Proof.IonText;
    }
    stringBuilder = "{" + stringBuilder + "}";
    const writer: Writer = makePrettyWriter();
    const reader: Reader = makeReader(stringBuilder);
    writer.writeValues(reader);
    return decodeUtf8(writer.getBytes());
}

/**
 * Returns the string representation of a given GetDigestResponse.
 * @param digestResponse The GetDigestResponse to convert to string.
 * @returns The string representation of the supplied GetDigestResponse.
 */
export function digestResponseToString(digestResponse: GetDigestResponse): string {
    let stringBuilder = "";
    if (digestResponse.Digest) {
        stringBuilder += "Digest: " + JSON.stringify(toBase64(<Uint8Array>digestResponse.Digest)) + ", ";
    }
    if (digestResponse.DigestTipAddress.IonText) {
        stringBuilder += "DigestTipAddress: " + digestResponse.DigestTipAddress.IonText;
    }
    stringBuilder = "{" + stringBuilder + "}";
    const writer: Writer = makePrettyWriter();
    const reader: Reader = makeReader(stringBuilder);
    writer.writeValues(reader);
    return decodeUtf8(writer.getBytes());
}

/**
 * Sleep for the specified amount of time.
 * @param ms The amount of time to sleep in milliseconds.
 * @returns Promise which fulfills with void.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find the value of a given path in an Ion value. The path should contain a blob value.
 * @param value The Ion value that contains the journal block attributes.
 * @param path The path to a certain attribute.
 * @returns Uint8Array value of the blob, or null if the attribute cannot be found in the Ion value
 *                  or is not of type Blob
 */
export function getBlobValue(value: dom.Value, path: string): Uint8Array | null {
    const attribute: dom.Value = value.get(path);
    if (attribute !== null && attribute.getType() === IonTypes.BLOB) {
        return attribute.uInt8ArrayValue();
    }
    return null;
}

/**
 * Returns the string representation of a given ValueHolder.
 * @param valueHolder The ValueHolder to convert to string.
 * @returns The string representation of the supplied ValueHolder.
 */
export function valueHolderToString(valueHolder: ValueHolder): string {
    const stringBuilder = `{ IonText: ${valueHolder.IonText}}`;
    const writer: Writer = makePrettyWriter();
    const reader: Reader = makeReader(stringBuilder);
    writer.writeValues(reader);
    return decodeUtf8(writer.getBytes());
}

/**
 * Checks a string for compliance with table naming constrains: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming
 * @param tableName A string containing a name of a table.
 * @returns Returns true if string complies with table naming constrains and trows an error if otherwise.
 */
export function validateTableNameConstrains(tableName: string): boolean {
    const nameStringRegexTemplate = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/g;
    const nameStringRegexCheckResult = nameStringRegexTemplate.test(tableName);

    if (!nameStringRegexCheckResult) {
        throw new Error(`Please check tableName complies with Amazon QLDB table naming constrains: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming`)
    }

    const partiQLReservedWords = ["ABSOLUTE", "ACTION", "ADD", "ALL", "ALLOCATE", "ALTER", "AND", "ANY", "ARE", "AS", "ASC", "ASSERTION", "AT", "AUTHORIZATION", "AVG", "BAG", "BEGIN", "BETWEEN", "BIT", "BIT_LENGTH", "BLOB", "BOOL", "BOOLEAN", "BOTH", "BY", "CASCADE", "CASCADED", "CASE", "CAST", "CATALOG", "CHAR", "CHARACTER", "CHARACTER_LENGTH", "CHAR_LENGTH", "CHECK", "CLOB", "CLOSE", "COALESCE", "COLLATE", "COLLATION", "COLUMN", "COMMIT", "CONNECT", "CONNECTION", "CONSTRAINT", "CONSTRAINTS", "CONTINUE", "CONVERT", "CORRESPONDING", "COUNT", "CREATE", "CROSS", "CURRENT", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP", "CURRENT_USER", "CURSOR", "DATE", "DATE_ADD", "DATE_DIFF", "DAY", "DEALLOCATE", "DEC", "DECIMAL", "DECLARE", "DEFAULT", "DEFERRABLE", "DEFERRED", "DELETE", "DESC", "DESCRIBE", "DESCRIPTOR", "DIAGNOSTICS", "DISCONNECT", "DISTINCT", "DOMAIN", "DOUBLE", "DROP", "ELSE", "END", "END-EXEC", "ESCAPE", "EXCEPT", "EXCEPTION", "EXEC", "EXECUTE", "EXISTS", "EXTERNAL", "EXTRACT", "FALSE", "FETCH", "FIRST", "FLOAT", "FOR", "FOREIGN", "FOUND", "FROM", "FULL", "GET", "GLOBAL", "GO", "GOTO", "GRANT", "GROUP", "HAVING", "HOUR", "IDENTITY", "IMMEDIATE", "IN", "INDEX", "INDICATOR", "INITIALLY", "INNER", "INPUT", "INSENSITIVE", "INSERT", "INT", "INTEGER", "INTERSECT", "INTERVAL", "INTO", "IS", "ISOLATION", "JOIN", "KEY", "LANGUAGE", "LAST", "LEADING", "LEFT", "LEVEL", "LIKE", "LIMIT", "LIST", "LOCAL", "LOWER", "MATCH", "MAX", "MIN", "MINUTE", "MISSING", "MODULE", "MONTH", "NAMES", "NATIONAL", "NATURAL", "NCHAR", "NEXT", "NO", "NOT", "NULL", "NULLIF", "NUMERIC", "OCTET_LENGTH", "OF", "ON", "ONLY", "OPEN", "OPTION", "OR", "ORDER", "OUTER", "OUTPUT", "OVERLAPS", "PAD", "PARTIAL", "PIVOT", "POSITION", "PRECISION", "PREPARE", "PRESERVE", "PRIMARY", "PRIOR", "PRIVILEGES", "PROCEDURE", "PUBLIC", "READ", "REAL", "REFERENCES", "RELATIVE", "REMOVE", "RESTRICT", "REVOKE", "RIGHT", "ROLLBACK", "ROWS", "SCHEMA", "SCROLL", "SECOND", "SECTION", "SELECT", "SESSION", "SESSION_USER", "SET", "SEXP", "SIZE", "SMALLINT", "SOME", "SPACE", "SQL", "SQLCODE", "SQLERROR", "SQLSTATE", "STRING", "STRUCT", "SUBSTRING", "SUM", "SYMBOL", "SYSTEM_USER", "TABLE", "TEMPORARY", "THEN", "TIME", "TIMESTAMP", "TIMEZONE_HOUR", "TIMEZONE_MINUTE", "TO", "TO_STRING", "TO_TIMESTAMP", "TRAILING", "TRANSACTION", "TRANSLATE", "TRANSLATION", "TRIM", "TRUE", "TUPLE", "TXID", "UNDROP", "UNION", "UNIQUE", "UNKNOWN", "UNPIVOT", "UPDATE", "UPPER", "USAGE", "USER", "USING", "UTCNOW", "VALUE", "VALUES", "VARCHAR", "VARYING", "VIEW", "WHEN", "WHENEVER", "WHERE", "WITH", "WORK", "WRITE", "YEAR", "ZONE"];
    const partiQLReservedWordsCheck = partiQLReservedWords.includes(tableName.toUpperCase());

    if (partiQLReservedWordsCheck) {
        throw new Error(`Please check tableName does not contain PartiQL reserved words: https://docs.aws.amazon.com/qldb/latest/developerguide/ql-reference.reserved.html`)
    }

    return true;
}

/**
 * Checks a string for compliance with ledger naming constrains: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming
 * @param ledgerName A string containing a name of a table.
 * @returns Returns true if string complies with ledger naming constrains and trows an error if otherwise.
 */
export function validateLedgerNameConstrains(ledgerName: string): boolean {
    const nameStringRegexTemplate = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}[A-Za-z0-9]{0,1}$/g;
    const nameStringRegexCheckResult = nameStringRegexTemplate.test(ledgerName);

    if (!nameStringRegexCheckResult) {
        throw new Error(`Please check ledgerName complies with Amazon QLDB table naming constrains: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming`)
    }

    const nameNonDigitRegexTemplate = /\D/g;
    const nameNonDigitRegexCheckResult = nameNonDigitRegexTemplate.test(ledgerName);

    if (!nameNonDigitRegexCheckResult) {
        throw new Error(`Please check ledgerName - can not be all digits: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming`)
    }

    const nameTwoHyphensRegexTemplate = /--/g;
    const nameTwoHyphensRegexCheckResult = nameTwoHyphensRegexTemplate.test(ledgerName);

    if (nameTwoHyphensRegexCheckResult) {
        throw new Error(`Please check ledgerName - can not contain two consecutive hyphens: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming`)
    }

    return true;
}

/**
 * Checks a string for compliance with document attribute naming constrains.
 * @param attributeName A string containing a name of a document attribute.
 * @returns Returns true if string complies with attribute naming constrains and trows an error if otherwise.
 */
export function validateAttributeNameConstrains(attributeName: string): boolean {
    const nameStringRegexTemplate = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/g;
    const nameStringRegexCheckResult = nameStringRegexTemplate.test(attributeName);

    if (!nameStringRegexCheckResult) {
        throw new Error(`Please check attributeName complies with Amazon QLDB table naming constrains: https://docs.aws.amazon.com/qldb/latest/developerguide/limits.html#limits.naming`)
    }

    const partiQLReservedWords = ["ABSOLUTE", "ACTION", "ADD", "ALL", "ALLOCATE", "ALTER", "AND", "ANY", "ARE", "AS", "ASC", "ASSERTION", "AT", "AUTHORIZATION", "AVG", "BAG", "BEGIN", "BETWEEN", "BIT", "BIT_LENGTH", "BLOB", "BOOL", "BOOLEAN", "BOTH", "BY", "CASCADE", "CASCADED", "CASE", "CAST", "CATALOG", "CHAR", "CHARACTER", "CHARACTER_LENGTH", "CHAR_LENGTH", "CHECK", "CLOB", "CLOSE", "COALESCE", "COLLATE", "COLLATION", "COLUMN", "COMMIT", "CONNECT", "CONNECTION", "CONSTRAINT", "CONSTRAINTS", "CONTINUE", "CONVERT", "CORRESPONDING", "COUNT", "CREATE", "CROSS", "CURRENT", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP", "CURRENT_USER", "CURSOR", "DATE", "DATE_ADD", "DATE_DIFF", "DAY", "DEALLOCATE", "DEC", "DECIMAL", "DECLARE", "DEFAULT", "DEFERRABLE", "DEFERRED", "DELETE", "DESC", "DESCRIBE", "DESCRIPTOR", "DIAGNOSTICS", "DISCONNECT", "DISTINCT", "DOMAIN", "DOUBLE", "DROP", "ELSE", "END", "END-EXEC", "ESCAPE", "EXCEPT", "EXCEPTION", "EXEC", "EXECUTE", "EXISTS", "EXTERNAL", "EXTRACT", "FALSE", "FETCH", "FIRST", "FLOAT", "FOR", "FOREIGN", "FOUND", "FROM", "FULL", "GET", "GLOBAL", "GO", "GOTO", "GRANT", "GROUP", "HAVING", "HOUR", "IDENTITY", "IMMEDIATE", "IN", "INDEX", "INDICATOR", "INITIALLY", "INNER", "INPUT", "INSENSITIVE", "INSERT", "INT", "INTEGER", "INTERSECT", "INTERVAL", "INTO", "IS", "ISOLATION", "JOIN", "KEY", "LANGUAGE", "LAST", "LEADING", "LEFT", "LEVEL", "LIKE", "LIMIT", "LIST", "LOCAL", "LOWER", "MATCH", "MAX", "MIN", "MINUTE", "MISSING", "MODULE", "MONTH", "NAMES", "NATIONAL", "NATURAL", "NCHAR", "NEXT", "NO", "NOT", "NULL", "NULLIF", "NUMERIC", "OCTET_LENGTH", "OF", "ON", "ONLY", "OPEN", "OPTION", "OR", "ORDER", "OUTER", "OUTPUT", "OVERLAPS", "PAD", "PARTIAL", "PIVOT", "POSITION", "PRECISION", "PREPARE", "PRESERVE", "PRIMARY", "PRIOR", "PRIVILEGES", "PROCEDURE", "PUBLIC", "READ", "REAL", "REFERENCES", "RELATIVE", "REMOVE", "RESTRICT", "REVOKE", "RIGHT", "ROLLBACK", "ROWS", "SCHEMA", "SCROLL", "SECOND", "SECTION", "SELECT", "SESSION", "SESSION_USER", "SET", "SEXP", "SIZE", "SMALLINT", "SOME", "SPACE", "SQL", "SQLCODE", "SQLERROR", "SQLSTATE", "STRING", "STRUCT", "SUBSTRING", "SUM", "SYMBOL", "SYSTEM_USER", "TABLE", "TEMPORARY", "THEN", "TIME", "TIMESTAMP", "TIMEZONE_HOUR", "TIMEZONE_MINUTE", "TO", "TO_STRING", "TO_TIMESTAMP", "TRAILING", "TRANSACTION", "TRANSLATE", "TRANSLATION", "TRIM", "TRUE", "TUPLE", "TXID", "UNDROP", "UNION", "UNIQUE", "UNKNOWN", "UNPIVOT", "UPDATE", "UPPER", "USAGE", "USER", "USING", "UTCNOW", "VALUE", "VALUES", "VARCHAR", "VARYING", "VIEW", "WHEN", "WHENEVER", "WHERE", "WITH", "WORK", "WRITE", "YEAR", "ZONE"];
    const partiQLReservedWordsCheck = partiQLReservedWords.includes(attributeName.toUpperCase());

    if (partiQLReservedWordsCheck) {
        throw new Error(`Please check attributeName does not contain PartiQL reserved words: https://docs.aws.amazon.com/qldb/latest/developerguide/ql-reference.reserved.html`)
    }

    return true;
}