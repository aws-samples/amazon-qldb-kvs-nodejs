# Metadata verification algorithm

The `verifyMetadata(metadata)` method of the library implements the following logic to verify the document revision metadata and the proof against the ledger:

1. Through the `metadata` parameter the unctions receives document revision metadata like the following:
    ```JSON
    {
        "LedgerName": "vehicle-registration",
        "TableName": "Shire",
        "BlockAddress": {
            "IonText": "{strandId: \"KbW0e2QaN2uBUWzRYGeOCe\", sequenceNo: 21}"
        },
        "DocumentId": "6rq58mFpDOw6dUXm4LAdT4",
        "RevisionHash": "3P2Z7Ex9CvXTyBX7O/TrgicOLcjl1e2e/Wv2zUUrMsc=",
        "Proof": {
            "IonText": "[{{MC+5lx76dgGUwdNgQcBGU0T59GuHd/wu8qnn6NSQA9o=}},{{oHDWMPi/noEKVvXTi2s05wOhVVrvKNYpXZJliZ5s1BE=}},{{hYgPb4sqRKtkJbKVrszPL4fR9PSv2y0u+HHQ6g/E5yw=}},{{hYgPb4sqRKtkJbKVrszPL4fR9PSv2y0u+HHQ6g/E5yw=}},{{ro/XdmizxMZ9uc1ZHpTXJfCECd7UA0uEmcz303CmlWs=}},{{dQPDYhY9gUInSgE2Ap8uP3o5pPK6zQHvoW5OomJoaPs=}},{{Eir1146w00ciMGdgujpAVsrO+pws9WgMXA/G34NkM1M=}},{{IPvTDXU7LFl06IdiMUMhBcwx++VlZ4HhJlNrmr2efZY=}},{{+X2GDOYRIycdKoo4D4Td+gWmxWsj/DWGbqat0gMO4pM=}}]"
        },
        "LedgerDigest": {
            "Digest": "KGuCkc79bsDfG9X0RjI7QgR/D4wlOarP/dKYnbnFjDo=",
            "DigestTipAddress": {
                "IonText": "{strandId:\"KbW0e2QaN2uBUWzRYGeOCe\",sequenceNo:46}"
            }
        }
    }
    ```
2. Retrieve document revision by `DocumentId` from the Amazon QLDB ledger.
3. Compare revision hash from `RevisionHash` attribute of submitted metadata with the one retrieved from the ledger.

By now we tested that the revision metadata passed into the function matches the corresponding revision metadata retrieved from QLDB. Next, we want to verify that we can compute digest value that will match with the `LedgerDigest` passed to the function. We will start with `RevisionHash` provided to the function and iterate through the proof (hash chain), we've got from QLDB.

1. Take the `RevisionHash` and `LedgerDigest.Digest` from the input document and retrieve proof (hash chain) from QLDB.

2. To generate a candidate `LedgerDigest`, start with `RevisionHash` and iterate through the proof (hash chain), we've got from QLDB using the [`dot` function](https://docs.aws.amazon.com/qldb/latest/developerguide/verification.tutorial-block-hash.html#verification.tutorial.step-6).

3. Compare the candidate `LedgerDigest` with the `LedgerDigest` passed into the function. If they match, that means that the document revision, the data in block, and the whole previous QLDB ledger updates have not been changed.

For more information see [Tutorial: Verifying data using an AWS SDK](https://docs.aws.amazon.com/qldb/latest/developerguide/verification.tutorial-block-hash.html)