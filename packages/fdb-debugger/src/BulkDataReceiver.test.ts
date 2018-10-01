import BulkDataReceiver from './BulkDataReceiver';
import { FDBTypes } from '@fitbit/fdb-protocol';

// All the other BulkDataReceiver behaviour is thoroughly covered by the
// screenshot tests in index.test.ts.

it('registers closer methods with a common prefix', () => {
  const receiver = new BulkDataReceiver({} as any, '');
  const dispatcher = {
    method: jest.fn().mockReturnThis(),
  } as any;
  receiver.registerCloserMethods(dispatcher, 'foo.bar');

  expect(dispatcher.method).toHaveBeenCalledTimes(2);
  expect(dispatcher.method).toHaveBeenCalledWith(
    'foo.bar.finalize', FDBTypes.StreamCloseParams, receiver.finalizeStream,
  );
  expect(dispatcher.method).toHaveBeenCalledWith(
    'foo.bar.abort', FDBTypes.StreamCloseParams, receiver.abortStream,
  );
});

it('registers closer methods with arbitrary names', () => {
  const receiver = new BulkDataReceiver({} as any, '');
  const dispatcher = {
    method: jest.fn().mockReturnThis(),
  } as any;
  receiver.registerCloserMethods(dispatcher, 'foo.bar.done', 'bar.baz.undo');

  expect(dispatcher.method).toHaveBeenCalledTimes(2);
  expect(dispatcher.method).toHaveBeenCalledWith(
    'foo.bar.done', FDBTypes.StreamCloseParams, receiver.finalizeStream,
  );
  expect(dispatcher.method).toHaveBeenCalledWith(
    'bar.baz.undo', FDBTypes.StreamCloseParams, receiver.abortStream,
  );
});
