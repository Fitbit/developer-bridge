module.exports = {
  ...require('../jest.config.base'),
  clearMocks: true,
  restoreMocks: true,
  displayName: require('./package.json').name,
};
