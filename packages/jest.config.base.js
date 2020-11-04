/**
 * The contents of this module are merged into the individual packages'
 * Jest configurations. Note that <rootDir> gets set to the respective
 * project's root directory, not the root of the monorepo.
 */

const baseConfig = {
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$',
  roots: ['<rootDir>/src'],
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/tsconfig.json',
    },
  },
  testEnvironment: 'node',
};

// Gotta be compatible with Node 8.0, which does not support object spread.
module.exports = (overrides) => Object.assign({}, baseConfig, overrides);
