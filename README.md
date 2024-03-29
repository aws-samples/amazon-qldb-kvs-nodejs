# Amazon QLDB KVS for NodeJS

A simple Key-Value store interface library for Amazon Quantum Ledger Database (QLDB) service with extra functions for document verification. 

### Key features
1. Uploading/downloading strings, numbers, JSON objects and binary files with a simple key-value store interface.
2. Requesting document metadata by its key for storing outside of the ledger and use later for verification against the ledger.
3. Submitting document metadata to verify against the ledger.
4. Retrieving historical records for the document by its key.

### Pre-requisites

1. Make sure you are using NodeJS version 10 and above.
2. Configure your [AWS NodeJS SDK](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/configuring-the-jssdk.html)
3. For making changes to the library and testing please also install [TypeScript](https://www.typescriptlang.org/index.html#download-links).

### Installation

```bash
npm install --save amazon-qldb-kvs-nodejs
```

### Usage

``` Javascript
const QLDBKVS = require("amazon-qldb-kvs-nodejs").QLDBKVS;
const LEDGER_NAME = "vehicle-registration";
const TABLE_NAME = "KVS1";
const DOC_OBJECT_KEY1 = "myKey1";
const DOC_OBJECT_VALUE1 = {
    text: "test1",
    number: 1
};
const DOC_OBJECT_KEY2 = "myKey2";
const DOC_OBJECT_VALUE2 = {
    text: "test2",
    number: 2
};

(async () => {
    try {
        // Pre-configuring KVS interface with Ledger name and Table name that we will use for our Key-value storage
        // We also instruct the library to check if table exists and create a new one if it doesn't. Set the last property to "false" if you know your table already exists
        const qldbKVS = new QLDBKVS(LEDGER_NAME, TABLE_NAME, true);

        // Put a JSON document as a stringified value for a respective key
        const response = await qldbKVS.setValue(DOC_OBJECT_KEY1, DOC_OBJECT_VALUE1);

        if (response) {
            console.log(`Internal document Id from the Ledger, returned by setValue: ${JSON.stringify(response)}`);
        } else {
            console.log(`Could not set value for key "${DOC_OBJECT_KEY1}"`);
        }

        // Put up to 10 JSON documents as a stringified value for a respective key
        const responses = await qldbKVS.setValues([DOC_OBJECT_KEY1, DOC_OBJECT_KEY2], [DOC_OBJECT_VALUE1, DOC_OBJECT_VALUE2]);

        if (responses) {
            console.log(`Internal document Id from the Ledger, returned by setValues: ${JSON.stringify(responses)}`);
        } else {
            console.log(`Could not set value for keys "[${DOC_OBJECT_KEY1}, ${DOC_OBJECT_KEY2}]"`);
        }

        // Get value for key "/myAppConfigPrefix/config"
        const valueFromLedger = await qldbKVS.getValue(DOC_OBJECT_KEY1);

        if (valueFromLedger) {
            console.log(`Value from Ledger: ${JSON.stringify(valueFromLedger)}`);
        } else {
            console.log(`Value for key "${DOC_OBJECT_KEY1}" is not found.`);
        }

        // Get values for multiple keys "/myAppConfigPrefix/config". Current limit is up to 32 keys at a time to avoid hitting QLDB limits.
        const valuesFromLedger = await qldbKVS.getValues([DOC_OBJECT_KEY1, DOC_OBJECT_KEY2]);

        if (valuesFromLedger) {
            console.log(`Value from Ledger: ${JSON.stringify(valuesFromLedger)}`);
        } else {
            console.log(`Values for keys "${[DOC_OBJECT_KEY1, DOC_OBJECT_KEY2]}" is not found.`);
        }

        // Get the latest metadata for stored document by its key
        const metadata = await qldbKVS.getMetadata(DOC_OBJECT_KEY1);
        if (metadata) {
            console.log(`Metadata for verifying document with Key "${DOC_OBJECT_KEY1}": ${JSON.stringify(metadata)}`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" not found.`);
        }

        // Alternatively, you can get the metadata for a specific version of the document by document Id and Transaction Id that // you get from the response object when creating or updating it:
        const metadataFromIds = await qldbKVS.getMetadataByDocIdAndTxId(response[0].documentId, response[0].txId);
        if (metadataFromIds) {
            console.log(`Metadata for verifying document with Document ID "${response.documentId}" and transaction Id ${response.txId} : ${JSON.stringify(metadataFromIds)}`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" not found.`);
        }

        // Verify metadata for stored document against the ledger digest. This is similar to "Verification" section in QLDB console.
        const isValid = await qldbKVS.verifyLedgerMetadata(metadata);
        if (isValid) {
            console.log(`Metadata for document with Key "${DOC_OBJECT_KEY1}" is valid.`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" is not valid.`);
        }

        // Getting history for stored document, optionally specify to and from date strings in ISO 8601 format like 2019-06-05T00:00:00Z (no milliseconds).
        const history = await qldbKVS.getHistory(DOC_OBJECT_KEY1, /*fromDateStringAsISO, toDateStringAsISO*/);
        if (history) {
            console.log(`History for document with Key "${DOC_OBJECT_KEY1}": ${JSON.stringify(history)}`);
        } else {
            console.log(`History for document with Key "${DOC_OBJECT_KEY1}" is not found.`);
        }

        // Getting document revision by metadata
        const documentRevision = await qldbKVS.getDocumentRevisionByLedgerMetadata(metadata);
        if (documentRevision) {
            console.log(`Document revision for metadata "${JSON.stringify(metadata)}": ${JSON.stringify(documentRevision)}`);
        } else {
            console.log(`Document revision for metadata "${JSON.stringify(metadata)} is not found.`);
        }

        // Verifying document revision hash for full document revision. You may use it in combination with "verifyMetadata" function to check integrity of data from the level of the document all the way to the LedgerDigest
        const isValid = await qldbKVS.verifyDocumentRevisionHash(JSON.parse(JSON.stringify(documentRevision)));
        if (isValid) {
            console.log(`Document revision hash is valid`);
        } else {
            console.log(`Document revision hash is not valid`);
        }

    } catch (err) {
        console.error(`Error: ${err}`);
    }
})();
```

### Running unit tests
```bash
npm install
npm run test
```

### Building full documentation

```bash
npm install
npm run doc
```

### Implementation details

1. If the value is a JSON document, the library will convert to Amazon Ion format and add an indexed filed `_k` to hold the key.
2. For Sting and File (binary) values, in addition to indexed filed `_k` the library will add an extra filed `_v` to hold the value. This field is not indexed, which means that queries can be performed only based on `_k` attribute and can not access any attributes of the stored value.
3. Files, uploaded with `uploadAsFile` method, are converted to base64 format and stored as a string. Maximum file size in this case is around 88 Kb. For larger files it is better to use an object storage service like Amazon S3 with Object Lock feature.
4. Since Amazon Ion is richer in types than JSON, automatic conversion will convert between the following types:


| JSON Type Name | Amazon Ion Type Name|
|-|-|
| String | string |
| Number | int |
| Number with decimal point | float |
| Boolean | boolean |
| Null | null |
| Object | struct |
| Array | list |

### Verification algorithm
For the details on how verification algorithm works, please see this document: [VERIFICATION.md](./docs/VERIFICATION.md)
