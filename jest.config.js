const { jsWithBabel: tsjPreset } = require('ts-jest/presets');

module.exports = {
  projects: ['<rootDir>/packages/*/jest.config.js'],
  coverageDirectory: '<rootDir>/coverage',
  transform: tsjPreset.transform,
  transformIgnorePatterns: ['node_modules/(?!p-wait-for|p-timeout)'],
};
