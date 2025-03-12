/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  silent: false,
  verbose: true,
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
};
