import vorpal from 'vorpal';

import AppContext from '../models/AppContext';
import commandTestHarness from '../testUtils/commandTestHarness';
import HostConnections from '../models/HostConnections';

import * as build from './build';
import buildAndInstall from './buildAndInstall';
import * as install from './install';

jest.mock('./build');
jest.mock('./install');

let cli: vorpal;
let appContext: AppContext;
let hostConnections: HostConnections;
let buildActionSpy: jest.MockInstance<typeof build.buildAction>;
let installActionSpy: jest.MockInstance<typeof install.installAction>;

beforeEach(() => {
  appContext = new AppContext();
  hostConnections = new HostConnections();
  ({ cli } = commandTestHarness(buildAndInstall({ appContext, hostConnections })));
  buildActionSpy = jest.spyOn(build, 'buildAction');
  installActionSpy = jest.spyOn(install, 'installAction');

  buildActionSpy.mockImplementationOnce(() => Promise.resolve);
  installActionSpy.mockImplementationOnce(() => Promise.resolve);
});

it('calls the buildAction and then the installAction', async () => {
  await cli.exec('build-and-install app.fba');
  expect(buildActionSpy).toBeCalled();
  expect(installActionSpy).toBeCalled();
});

it('calls the installAction with the provided packagePath', async () => {
  await cli.exec('build-and-install app.fba');
  expect(installActionSpy).toBeCalledWith(
    expect.anything(),
    { appContext, hostConnections },
    expect.objectContaining({ packagePath: 'app.fba' }),
  );
});

it('waits for the build to complete before calling install', async () => {
  cli.exec('build-and-install');
  expect(buildActionSpy).toBeCalled();
  expect(installActionSpy).not.toBeCalled();
});

it('can be called using the alias "bi"', async () => {
  await cli.exec('bi');
  expect(buildActionSpy).toBeCalled();
  expect(installActionSpy).toBeCalled();
});
