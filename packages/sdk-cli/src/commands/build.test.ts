import child_process from 'child_process';
import { EventEmitter } from 'events';

import { buildProcess } from './build';

jest.mock('child_process');

let childProcessSpawnSpy: jest.MockInstance<typeof child_process.spawn>;
let childProcessMock: EventEmitter;

beforeEach(() => {
  childProcessMock = new EventEmitter();

  childProcessSpawnSpy = jest.spyOn(child_process, 'spawn');
  childProcessSpawnSpy.mockImplementationOnce(() => childProcessMock);
});

it('resolves with the code and signal when the build process exits', () => {
  const buildPromise = buildProcess();
  expect(childProcessSpawnSpy).toBeCalled();
  childProcessMock.emit('exit', 0);
  return expect(buildPromise).resolves.toEqual({ code: 0 });
});

it('rejects if the build process emits an error', () => {
  const buildPromise = buildProcess();
  childProcessMock.emit('error', 'some error');
  return expect(buildPromise).rejects.toBe('some error');
});
