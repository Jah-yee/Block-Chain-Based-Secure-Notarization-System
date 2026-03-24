module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/actor.test.js', '**/tests/adversarial.test.js', '**/tests/kms-signer.test.js'],
    collectCoverageFrom: [
        'middleware/actor.js'
    ]
};
