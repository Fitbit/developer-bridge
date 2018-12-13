module.exports = require('../jest.config.base')({
  // displayName must be set to work around buggy jest behaviour.
  // https://github.com/facebook/jest/issues/5597
  displayName: require('./package.json').name,
});
