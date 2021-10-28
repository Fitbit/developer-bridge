/**
 * The contents of this module are merged into the individual packages'
 * Jest configurations. Note that <rootDir> gets set to the respective
 * project's root directory, not the root of the monorepo.
 */

const { jsWithBabel: tsjPreset } = require('ts-jest/presets');

const baseConfig = {
  moduleFileExtensions: ['ts', 'js'],
  transform: tsjPreset.transform,
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$',
  roots: ['<rootDir>/src'],
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/tsconfig.json',
    },
  },
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/(?!p-wait-for|p-timeout)'],
};

// Gotta be compatible with Node 8.0, which does not support object spread.
module.exports = (overrides) => Object.assign({}, baseConfig, overrides);
