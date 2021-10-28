module.exports = require('../jest.config.base')({
  clearMocks: true,
  restoreMocks: true,
  displayName: require('./package.json').name,
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!p-wait-for)'],
});
