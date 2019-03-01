import os from 'os';

import vorpal from 'vorpal';

import AppContext from '../models/AppContext';
import setAppPackage, { defaultAppPath } from './setAppPackage';
import commandTestHarness from '../testUtils/commandTestHarness';

const mockApp = {
  uuid: 'fakeUUID',
  buildId: 'fakeBuildID',
};

let cli: vorpal;
let mockLog: jest.Mock;
let appContext: AppContext;
let loadAppPackageSpy: jest.SpyInstance;

function doLoad() {
  return cli.exec('set-app-package app.fba');
}

beforeEach(() => {
  appContext = new AppContext();
  ({ cli, mockLog } = commandTestHarness(setAppPackage({ appContext })));
  loadAppPackageSpy = jest.spyOn(appContext, 'loadAppPackage');
  loadAppPackageSpy.mockResolvedValue(mockApp);
});

it('logs an error if the package fails to load', async () => {
  loadAppPackageSpy
    .mockImplementationOnce(() => { throw new Error('Failed to load package'); });
  await doLoad();
  expect(mockLog.mock.calls[0]).toMatchSnapshot();
});

it('logs the app ID and build ID', async () => {
  await doLoad();
  expect(mockLog.mock.calls[0]).toMatchSnapshot();
});

it('untildifies the package path', async () => {
  await cli.exec('set-app-package ~/app.fba');
  expect(loadAppPackageSpy).toBeCalledWith(`${os.homedir()}/app.fba`);
});

describe('when called with no package path', () => {
  describe('and no package was loaded previously', () => {
    beforeEach(() => cli.exec('set-app-package'));

    it('logs that it is using the default', () =>
        expect(mockLog.mock.calls).toMatchSnapshot());

    it('loads the default app package', () =>
      expect(loadAppPackageSpy).toBeCalledWith(defaultAppPath));
  });

  describe('and a package was loaded previously', () => {
    const oldPath = 'path/to/the/app/package.fba';

    beforeEach(() => {
      appContext.appPackagePath = oldPath;
      return cli.exec('set-app-package');
    });

    it('logs that it is reloading the app package', () =>
      expect(mockLog.mock.calls).toMatchSnapshot());

    it('reloads the app package', () =>
      expect(loadAppPackageSpy).toBeCalledWith(oldPath));
  });
});
