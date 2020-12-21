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

import { QldbDriver } from "amazon-qldb-driver-nodejs";
import { ClientConfiguration } from "aws-sdk/clients/qldbsession";
import { log } from "./Logging";
const logger = log.getLogger("qldb-helper");

//const QldbDriver: QldbDriver = createQldbDriver();


/**
 * Create a pooled driver for creating sessions.
 * @param ledgerName The name of the ledger to create the driver on.
 * @param serviceConfigurationOptions The configurations for the AWS SDK client that the driver uses.
 * @returns The pooled driver for creating sessions.
 */
export function createQldbDriver(
    ledgerName: string,
    serviceConfigurationOptions: ClientConfiguration = {}
): QldbDriver {
    return new QldbDriver(ledgerName, serviceConfigurationOptions);
}
