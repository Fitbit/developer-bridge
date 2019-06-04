import BulkDataReceiver from './BulkDataReceiver';
import { FDBTypes, BulkData, BulkDataStream } from '@fitbit/fdb-protocol';

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

describe('when the stream open promise resolution is delayed', () => {
  let openResolve: () => void;
  let openReject: (error: Error) => void;

  let receiver: BulkDataReceiver;

  let openPromise: Promise<Buffer>;
  let openResolvedMockFn: jest.Mock;
  let openRejectedMockFn: jest.Mock;

  let mockBulkDataStream: Partial<BulkDataStream>;

  beforeEach(() => {
    mockBulkDataStream = {
      token: 0,
      finalize: jest.fn(),
    };

    const mockBulkData: Partial<BulkData> = {
      createWriteStream: () => mockBulkDataStream as BulkDataStream,
    };

    receiver = new BulkDataReceiver(mockBulkData as Partial<BulkData> as BulkData, 'test');

    openPromise = receiver.receiveFromStream(() => new Promise((resolve, reject) => {
      openResolve = resolve;
      openReject = reject;
    }));

    openResolvedMockFn = jest.fn();
    openRejectedMockFn = jest.fn();
    openPromise.then(openResolvedMockFn, openRejectedMockFn);
  });

  describe('receiveFromStream()', () => {
    it('rejects if the open call rejects', () => {
      openReject(new Error('failed to open'));
      return expect(openPromise).rejects.toThrowError();
    });

    it('resolves with finalized data', async () => {
      const fakeData = Buffer.from('some data');
      (mockBulkDataStream.finalize as jest.Mock).mockReturnValueOnce(fakeData);
      openResolve();
      await receiver.finalizeStream({ stream: 0 });
      return expect(openPromise).resolves.toBe(fakeData);
    });
  });

  describe('finalizeStream()', () => {
    let finalizePromise: Promise<void>;

    beforeEach(() => {
      finalizePromise = receiver.finalizeStream({ stream: 0 });
    });

    it('does not resolve until open promise resolves', async () => {
      const finalizeResolvedMockFn = jest.fn();
      finalizePromise.then(finalizeResolvedMockFn);

      expect(finalizeResolvedMockFn).not.toBeCalled();

      openResolve();
      await finalizePromise;

      expect(finalizeResolvedMockFn).toBeCalled();
    });

    it('resolves if stream open succeeds', () => {
      openResolve();
      return expect(finalizePromise).resolves.toBeUndefined();
    });

    it('rejects if stream open failed', () => {
      openReject(new Error('failed to open'));
      return expect(finalizePromise).rejects.toThrowError();
    });
  });

  describe('abortStream()', () => {
    let abortPromise: Promise<void>;

    beforeEach(() => {
      abortPromise = receiver.abortStream({ stream: 0 });
    });

    it('does not resolve until open promise resolves', async () => {
      const abortResolvedMockFn = jest.fn();
      abortPromise.then(abortResolvedMockFn);

      expect(abortResolvedMockFn).not.toBeCalled();

      openResolve();
      await abortPromise;

      expect(abortResolvedMockFn).toBeCalled();
    });

    it('resolves if stream open succeeds', () => {
      openResolve();
      return expect(abortPromise).resolves.toBeUndefined();
    });

    it('rejects if stream open failed', () => {
      openReject(new Error('failed to open'));
      return expect(abortPromise).rejects.toThrowError();
    });
  });
});
