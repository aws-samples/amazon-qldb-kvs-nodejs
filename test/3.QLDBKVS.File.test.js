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

const QLDBKVS = require("../dist/index").QLDBKVS;
const assert = require("assert");
const constants = require("./QLDBKVS.Constants");

/**
 * This is an example for retrieving the digest of a particular ledger.
 * @returns Promise which fulfills with void.
 */
describe('3.QLDBKVS.File.test', () => {
    let qldbKVS;
    beforeAll(async () => {
        qldbKVS = new QLDBKVS(constants.LEDGER_NAME, constants.TABLE_NAME);
    });

    it('Test uploadAsFile', async () => {
        const res = await qldbKVS.uploadAsFile(constants.FILE_KEY, constants.IN_FILE_PATH);
        console.log(`[TEST LOGS]Test setValue: ${JSON.stringify(res)}`)
        expect(res).toBeTruthy();
    }, 30000);

    it('Test downloadAsFile', async () => {
        const res = await qldbKVS.downloadAsFile(constants.FILE_KEY, constants.OUT_FILE_PATH);
        console.log(`[TEST LOGS]Test downloadAsFile: ${JSON.stringify(res)}`)
        expect(res).toEqual(constants.OUT_FILE_PATH)
    }, 5000);

});