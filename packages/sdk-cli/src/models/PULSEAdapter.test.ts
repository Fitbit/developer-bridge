import { EventEmitter } from 'events';
import { Duplex } from 'stream';

import { Interface, Link, Socket } from '@fitbit/pulse';

import PULSEAdapter from './PULSEAdapter';

jest.mock('@fitbit/pulse', () => ({
  Interface: jest.fn(),
  Socket: jest.fn(),
}));

let mockInterface: jest.Mocked<Interface>;
let mockLink: jest.Mocked<Link>;
let mockSocket: jest.Mocked<Socket>;

const testData = Buffer.from('hello world!');

class MockSocket extends EventEmitter {
  closed = false;
  readonly mtu = 500;
  onReceive = jest.fn();
  send = jest.fn();
  close = jest.fn();
}

function eventPromise<T>(stream: Duplex, eventName: string) {
  return new Promise<T>((resolve) => stream.once(eventName, resolve));
}

beforeEach(() => {
  mockSocket = new MockSocket() as unknown as jest.Mocked<Socket>;
  mockLink = {
    openSocket: jest.fn(() => mockSocket),
  } as unknown as jest.Mocked<Link>;
  mockInterface = {
    getLink: jest.fn(() => mockLink),
    close: jest.fn(),
  } as unknown as jest.Mocked<Interface>;
  Interface.create = jest.fn(() => mockInterface);
});

it('opens a connection', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  expect(pulseStream).toBeInstanceOf(Duplex);
  expect(Interface.create).toBeCalledWith(stream, {
    requestedTransports: ['reliable'],
  });
  expect(mockInterface.getLink).toBeCalled();
  expect(mockLink.openSocket).toBeCalledWith('reliable', 0x3e20);
});

it('sends a packet', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  pulseStream.write(testData);
  expect(mockSocket.send).toBeCalledWith(
    Buffer.concat([Buffer.from([0, 0]), testData]),
  );
});

it('sends multiple packets where message size exceeds MTU', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);

  const msgSize = mockSocket.mtu * 2;
  const msg = Buffer.alloc(msgSize);
  for (let i = 0; i < msgSize; i += 1) msg[i] = i % 255;

  pulseStream.write(msg);

  const chunkSize = mockSocket.mtu - 2;
  expect(mockSocket.send).toBeCalledWith(
    Buffer.concat([Buffer.from([0, 2]), msg.slice(0, chunkSize)]),
  );
  expect(mockSocket.send).toBeCalledWith(
    Buffer.concat([Buffer.from([0, 1]), msg.slice(chunkSize, 2 * chunkSize)]),
  );
  expect(mockSocket.send).toBeCalledWith(
    Buffer.concat([Buffer.from([0, 0]), msg.slice(2 * chunkSize)]),
  );
});

it('emits an error if sending a packet fails', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  mockSocket.send.mockImplementationOnce(() => {
    throw new Error('send failed');
  });
  pulseStream.write(testData);

  await expect(eventPromise(pulseStream, 'error')).resolves.toThrowError(
    'send failed',
  );
});

it('receives a packet', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  mockSocket.emit('data', Buffer.concat([Buffer.from([0, 0]), testData]));

  return new Promise<void>((resolve) =>
    pulseStream.on('data', (chunk) => {
      expect(chunk).toEqual(testData);
      stream.destroy();
      resolve();
    }),
  );
});

it('receives a packet sent in multiple chunks', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);

  mockSocket.emit(
    'data',
    Buffer.concat([
      Buffer.from([0, 1]),
      testData.slice(0, testData.length / 2),
    ]),
  );
  mockSocket.emit(
    'data',
    Buffer.concat([Buffer.from([0, 0]), testData.slice(testData.length / 2)]),
  );

  return new Promise<void>((resolve) =>
    pulseStream.on('data', (chunk) => {
      expect(chunk).toEqual(testData);
      stream.destroy();
      resolve();
    }),
  );
});

it('emits an error if receiving an invalid packet', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);

  const errorPromise = eventPromise(pulseStream, 'error');
  mockSocket.emit('data', Buffer.alloc(1));

  return expect(errorPromise).resolves.toEqual(
    new Error('Packet with length below minimum allowed'),
  );
});

it('emits an error if receiving an out of sequence packet', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);

  const errorPromise = eventPromise(pulseStream, 'error');
  mockSocket.emit(
    'data',
    Buffer.concat([
      Buffer.from([0, 2]),
      testData.slice(0, testData.length / 2),
    ]),
  );
  mockSocket.emit(
    'data',
    Buffer.concat([Buffer.from([0, 0]), testData.slice(testData.length / 2)]),
  );

  return expect(errorPromise).resolves.toEqual(
    new Error('Received out of sequence packet, expected 1, got 0'),
  );
});

it('ignores non-data packets', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);

  const errorHandler = jest.fn();
  pulseStream.on('error', errorHandler);
  mockSocket.emit('data', Buffer.from([1, 1]));

  pulseStream.destroy();

  return eventPromise(pulseStream, 'close');
});

it('closes interface when stream closes', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  pulseStream.destroy();
  await eventPromise(pulseStream, 'close');
  expect(mockInterface.close).toBeCalled();
});

it('closes stream when socket closes', async () => {
  const stream = new Duplex();
  const pulseStream = await PULSEAdapter.create(stream);
  mockSocket.emit('close');
  await eventPromise(pulseStream, 'close');
  expect(mockInterface.close).toBeCalled();
});
