import chalk from 'chalk';

import checkForUpdate from './checkForUpdate';

let consoleSpy: jest.MockInstance<typeof global.console.log>;
let mockUpdateNotifier: jest.Mock;

beforeEach(() => {
  consoleSpy = jest.spyOn(global.console, 'log');
  mockUpdateNotifier = jest.fn();
});

it('outputs a console message if there is a new update', () => {
  mockUpdateNotifier.mockReturnValueOnce({
    update: {
      name: '@fitbit/sdk-cli',
      current: '0.0.1',
      latest: '0.0.9',
    },
  });

  checkForUpdate(mockUpdateNotifier);

  const expectedMessage = '@fitbit/sdk-cli update available 0.0.1 → 0.0.9';
  expect(consoleSpy).toBeCalledWith(chalk.keyword('orange')(expectedMessage));
});

it('does not output a console message if there is no new update', () => {
  mockUpdateNotifier.mockReturnValueOnce({});

  checkForUpdate(mockUpdateNotifier);
  expect(consoleSpy).not.toBeCalled();
});
