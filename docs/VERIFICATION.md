# Metadata verification algorithm

1. Receive the document revision and proof information from the user, containing the following:
    ```
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
2. Retrieve a corresponding revision of a document with specified ID from QLDB.
3. Check the revision hash provided by the user (a value of `RevisionHash` attribute from above) is the same with the one we have got from QLDB.
4. Check the DocumentId provided by the user matches the Revision ID retrieved from QLDB (now I think this might be an overkill)
5. Compare block address data provided by the user with the block address data retrieved from QLDB

By now we verified that document revision data provided by the user matches the corresponding revision metadata retrieved from QLDB. Next, we want to verify that the metadata in QLDB has not been changed as well (trust, but verify).

To do that, we need to verify that we can derive the same Ledger Digest as specified by the user from the Revision Hash specified by the user and using a hash chain, we've got for corresponding revision from QLDB:

1. Take the Revision Hash and Ledger Digest provided by the user and a proof (hash chain), retrieved from QLDB. 

2. Generate a candidate Ledger Digest using the Revision Hash provided by the user and Proof (a hash chain), retrieved from QLDB.

3. Compare the candidate Ledger Digest with the Ledger Digest provided by the user. If they match, that means that the revision metadata of that document stored in QLDB has not been changed as well.