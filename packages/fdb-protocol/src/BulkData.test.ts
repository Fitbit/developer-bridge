import BulkData, * as bulkData from './BulkData';

import { TypesafeRequestDispatcher } from '@fitbit/jsonrpc-ts';

let handler: TypesafeRequestDispatcher;
let uut: BulkData;

beforeEach(() => {
  handler = new TypesafeRequestDispatcher();
  uut = new BulkData();
  uut.register(handler);
});

it('registers the io.write method with a strict params type definition', () => {
  expect(() => handler.onRequest('io.write', { stream: [1] }))
    .toThrow(/Invalid parameters/);
});

it('rejects writes to nonexistent streams', () => {
  expect(() => handler.onRequest('io.write', { stream: 'foo', data: 'bar' }))
    .toThrow(/Unknown bulk data stream/);
});

describe('when writing to a stream', () => {
  let stream: bulkData.BulkDataStream;
  let onWrite: jest.Mock<any>;

  beforeEach(() => {
    onWrite = jest.fn();
    stream = uut.createWriteStream(onWrite);
  });

  const ioWrite = (data: string | Buffer, encoding?: string) => (
    handler.onRequest('io.write', { data, encoding, stream: stream.token })
  );

  it('stores data written to it', () => {
    ioWrite('SGVsbG8sIHdvcmxkIQ==');
    expect(stream.finalize()).toEqual(Buffer.from('Hello, world!'));
  });

  it('stores unencoded data written to it', () => {
    ioWrite(Buffer.from('SGVsbG8sIHdvcmxkIQ==', 'base64'), 'none');
    expect(stream.finalize()).toEqual(Buffer.from('Hello, world!'));
  });

  it('concatenates multiple writes', () => {
    ioWrite('TWFnaWMg');
    ioWrite('c3RyaW5n');
    expect(stream.finalize()).toEqual(Buffer.from('Magic string'));
  });

  it('rejects invalid base64 data', () => {
    expect(() => ioWrite('Not base64.')).toThrow(/Data is not valid for encoding/);
  });

  it('does not corrupt the stream when a malformed write is received', () => {
    ioWrite('YWJj');
    expect(() => ioWrite('...')).toThrow(/not valid/);
    ioWrite('ZGVm');
    expect(stream.finalize()).toEqual(Buffer.from('abcdef'));
  });

  it('calls the onWrite callback for each write', () => {
    ioWrite('foo=');
    ioWrite('bar=');
    expect(onWrite).toHaveBeenCalledTimes(2);
  });

  it('calls the onWrite callback with the write and total length', () => {
    ioWrite('asdf');
    ioWrite('asdf');
    ioWrite('asdf');
    expect(onWrite).toHaveBeenCalledTimes(3);
    expect(onWrite).toHaveBeenLastCalledWith(3, 9);
  });

  it('rejects writes with unknown encodings', () => {
    expect(() => ioWrite('f17b17', 'hex')).toThrow(/Invalid parameters for method io.write/);
  });

  it('rejects writes that contain raw data with encoding', () => {
    expect(() => ioWrite(Buffer.from('abcdef'), 'base64'))
      .toThrow(/Data is not valid for encoding/);
  });

  it('rejects writes that contain string data with no encoding', () => {
    expect(() => ioWrite('abcdef', 'none'))
      .toThrow(/Data is not valid for encoding/);
  });
});

it('generates unique tokens for each stream', () => {
  const a = uut.createWriteStream().token;
  const bStream = uut.createWriteStream();
  const b = bStream.token;
  bStream.finalize();
  const c = uut.createWriteStream().token;

  expect(a).not.toEqual(b);
  expect(b).not.toEqual(c);
  expect(c).not.toEqual(a);
});

it('handles multiple concurrent streams independently', () => {
  const streamA = uut.createWriteStream();
  const streamB = uut.createWriteStream();

  handler.onRequest('io.write', { stream: streamA.token, data: 'Zm9v' });
  handler.onRequest('io.write', { stream: streamB.token, data: 'YmFy' });
  const streamAData = streamA.finalize();
  handler.onRequest('io.write', { stream: streamB.token, data: 'YmF6' });

  expect(() => handler.onRequest('io.write', { stream: streamA.token, data: 'asdf' }))
    .toThrow(/Unknown bulk data stream/);
  expect(streamAData).toEqual(Buffer.from('foo'));
  expect(streamB.finalize()).toEqual(Buffer.from('barbaz'));
});
