module.exports = {
  testEnvironment: "node",
  collectCoverage: true,
  collectCoverageFrom: [
    "controllers/**/*.js",
    "models/**/*.js",
    "!**/node_modules/**"
  ],
  coverageDirectory: "coverage",
  clearMocks: true
};