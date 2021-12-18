module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.js'],
    testTimeout: 70000,
    testSequencer: '<rootDir>/test/testSequencer.js'
};