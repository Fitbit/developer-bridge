import vorpal from '@moleculer/vorpal';

import * as auth from '../auth';
import logout from './logout';
import commandTestHarness from '../testUtils/commandTestHarness';

jest.mock('../auth');

let cli: vorpal;
let mockLog: jest.Mock;
let processExitSpy: jest.SpyInstance;

beforeEach(() => {
  ({ cli, mockLog } = commandTestHarness(logout));

  processExitSpy = jest.spyOn(process, 'exit');
  processExitSpy.mockImplementationOnce(() => {});

  return cli.exec('logout');
});

it('logs the user out',  () => expect(auth.logout as jest.Mock).toBeCalled());
it('exits the shell with code 0', () => expect(processExitSpy).toBeCalledWith(0));
it('logs a message to the user', () => expect(mockLog).toBeCalledWith('Logged out'));
