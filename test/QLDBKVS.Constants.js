let constants = {
    LEDGER_NAME: "vehicle-registration",
    TABLE_NAME: "TestKVS",
    // File test
    IN_FILE_PATH: "./test/testfile.txt",
    OUT_FILE_PATH: "./test/testfile.txt",
    FILE_KEY: "testfile.txt",
    DOC_STRING_KEY: "myKey1",
    DOC_STRING_VALUE: "MyValue1",
    DOC_OBJECT_KEY: "myKey25",
    DOC_OBJECT_VALUE: {
        test: "test2",
        number: 2
    }
}

module.exports = constants;