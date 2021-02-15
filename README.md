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
        const qldbKVS = new QLDBKVS(LEDGER_NAME, TABLE_NAME);

        // Put a JSON document as a stringified value for a respective key
        const response = await qldbKVS.setValue(DOC_OBJECT_KEY1, DOC_OBJECT_VALUE1);

        if (response) {
            console.log(`Internal document Id from the Ledger, returned by setValue: ${JSON.stringify(response)}`);
        } else {
            console.log(`Could not set value for key "${DOC_OBJECT_KEY1}"`);
        }

        // Get value for key "/myAppConfigPrefix/config"
        const valueFromLedger = await qldbKVS.getValue(DOC_OBJECT_KEY1);

        if (valueFromLedger) {
            console.log(`Value from Ledger: ${JSON.stringify(valueFromLedger)}`);
        } else {
            console.log(`Value for key "${DOC_OBJECT_KEY1}" is not found.`);
        }

        // Get values for multiple keys "/myAppConfigPrefix/config". Current limit is up to 32 keys at a time to avoid hitting QLDB limits.
        const valueFromLedger = await qldbKVS.getValues([DOC_OBJECT_KEY1, DOC_OBJECT_KEY2]);

        if (valueFromLedger) {
            console.log(`Value from Ledger: ${JSON.stringify(valueFromLedger)}`);
        } else {
            console.log(`Values for keys "${[DOC_OBJECT_KEY1, DOC_OBJECT_KEY2]}" is not found.`);
        }

        // Get the latest metadata for stored document by it's key
        const metadata = await qldbKVS.getMetadata(DOC_OBJECT_KEY1);
        if (metadata) {
            console.log(`Metadata for verifying document with Key "${DOC_OBJECT_KEY1}": ${JSON.stringify(metadata)}`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" not found.`);
        }

        // Alternatively, you can get the metadata for a specific version of the document by document Id and Transaction Id that // you get from the reponse object when creating or updating it:
        const metadataFromIds = await qldbKVS.getMetadataByDocIdAndTxId(response.documentId, response.txId);
        if (metadataFromIds) {
            console.log(`Metadata for verifying document with Document ID "${response.documentId}" and transaction Id ${response.txId} : ${JSON.stringify(metadataFromIds)}`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" not found.`);
        }

        // Verify metadata for stored document by it's metadata
        const isValid = await qldbKVS.verifyMetadata(metadata);
        if (isValid) {
            console.log(`Metadata for document with Key "${DOC_OBJECT_KEY1}" is valid.`);
        } else {
            console.log(`Metadata for key "${DOC_OBJECT_KEY1}" is not valid.`);
        }

        // Getting history for stored document
        const history = await qldbKVS.getHistory(DOC_OBJECT_KEY1);
        if (history) {
            console.log(`History for document with Key "${DOC_OBJECT_KEY1}": ${JSON.stringify(history)}`);
        } else {
            console.log(`History for document with Key "${DOC_OBJECT_KEY1}" is not found.`);
        }
    } catch (err) {
        console.error(`Error: ${err}`);
    }
})()
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

### Limitations

1. Documents stored with this library will have only two attributes: `_key` and `_val` containing document key and value respectively. This means that practically queries can be performed only based on `_key` attribute and can not access any attributes of the stored value.
2. Binary files, uploaded with `uploadAsFile` method, are converted to base64 format and stored as a string. Maximum file size in this case is around 88 Kb. For larger files please use a service like Amazon S3 with Object Lock feature.

### Verification algorithm
For the details on how verification algorithm works, please see this document: [VERIFICATION.md](./docs/VERIFICATION.md)
