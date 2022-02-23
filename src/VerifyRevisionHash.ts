import { makeHashReader, cryptoHasherProvider } from 'ion-hash-js';
import { makeTextWriter, makeReader, IonTypes, load, Writer, dumpBinary } from 'ion-js';
import { createHash } from "crypto";

import { log } from "./Logging";
import { toWriterBytes, metadataJSONtoIonUint8Array } from "./Util"
const logger = log.getLogger("qldb-helper");

const HASH_LENGTH = 32;

/**
 * Take two hash values, sort them, concatenate them, and generate a new hash value from the concatenated values.
 * @param h1 Byte array containing one of the hashes to compare.
 * @param h2 Byte array containing one of the hashes to compare.
 * @returns The concatenated array of hashes.
 */
function joinHashesPairwise(h1: Uint8Array, h2: Uint8Array): Buffer {
    if (h1.length === 0) {
        return Buffer.from(h2);
    }
    if (h2.length === 0) {
        return Buffer.from(h1);
    }
    let concat;
    if (compareHashValues(h1, h2) < 0) {
        concat = concatenate(h1, h2);
    } else {
        concat = concatenate(h2, h1);
    }
    const hash = createHash('sha256');
    hash.update(concat);
    // Return new digest
    return hash.digest();
}

/**
 * Compare two hash values by converting each Uint8Array byte, which is unsigned by default,
 * into a signed byte, assuming they are little endian.
 * @param hash1 The hash value to compare.
 * @param hash2 The hash value to compare.
 * @returns Zero if the hash values are equal, otherwise return the difference of the first pair of non-matching bytes.
 */
function compareHashValues(hash1: Uint8Array, hash2: Uint8Array): number {
    if (hash1.length !== HASH_LENGTH || hash2.length !== HASH_LENGTH) {
        throw new Error("Invalid hash.");
    }
    for (let i = hash1.length - 1; i >= 0; i--) {
        const difference = (hash1[i] << 24 >> 24) - (hash2[i] << 24 >> 24);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}

/**
 * Helper method that concatenates two Uint8Array.
 * @param arrays List of array to concatenate, in the order provided.
 * @returns The concatenated array.
 */
function concatenate(...arrays: Uint8Array[]) {
    let totalLength = 0;
    for (const arr of arrays) {
        totalLength += arr.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

function generateIonHash(ionDocBuffer: Uint8Array): Uint8Array {
    const hashReader = makeHashReader(
        makeReader(ionDocBuffer),
        cryptoHasherProvider('sha256'));
    while (hashReader.next() != null) {
    }

    return hashReader.digest();
}

export function validateRevisionHash(revisionAsJSON: any): boolean {
    const fcnName = "[validateRevisionHash]"

    const metadata = metadataJSONtoIonUint8Array(revisionAsJSON.metadata);
    const data = dumpBinary(revisionAsJSON.data);
    const hash = revisionAsJSON.hash;

    const metadataDigest = generateIonHash(metadata);
    const dataDigest = generateIonHash(data);
    const candidateHash = joinHashesPairwise(dataDigest, metadataDigest).toString('base64')
    logger.debug(`${fcnName} Candidate hash generated: ${candidateHash} comparing with ${hash}`);
    return candidateHash === hash
}