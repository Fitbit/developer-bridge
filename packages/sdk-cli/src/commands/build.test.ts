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

it('resolves if the build process exits with code 0', () => {
  const buildPromise = buildProcess();
  expect(childProcessSpawnSpy).toBeCalled();
  childProcessMock.emit('exit', 0);
  return expect(buildPromise).resolves.toBeUndefined();
});

it('rejects if the build process exits with a non-zero code', () => {
  const buildPromise = buildProcess();
  childProcessMock.emit('exit', 5);
  return expect(buildPromise).rejects.toBe(5);
});
