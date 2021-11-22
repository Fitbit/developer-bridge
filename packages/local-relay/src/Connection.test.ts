import EventEmitter from 'events';
import * as websocket from 'websocket';
import CloseCode from './CloseCode';

import Connection from './Connection';

describe('Connection', () => {
  describe('isHalfOpen', () => {
    it('true if no peer connected', () => {
      const connection = new Connection(
        new EventEmitter() as websocket.connection,
      );

      expect(connection.isHalfOpen()).toBe(true);
    });

    it('false if connected to peer', () => {
      const masterPeer = new EventEmitter() as websocket.connection;
      masterPeer.send = jest.fn();

      const connection = new Connection(masterPeer);

      expect(connection.isHalfOpen()).toBe(true);
      connection.connectPeer(new EventEmitter() as websocket.connection);
      expect(connection.isHalfOpen()).toBe(false);
    });
  });

  describe('forwards message to peer', () => {
    it('utf8', (done) =>
      messageTest({ type: 'utf8', utf8Data: 'test' }, 'test', done));

    it('binary', (done) => {
      const binaryData = Buffer.from('imaginary binary data');
      messageTest({ type: 'binary', binaryData }, binaryData, done);
    });

    it('neither (error)', (done) => {
      const consoleSpy = jest.spyOn(console, 'error');
      const closeSpy = jest
        .spyOn(Connection.prototype, 'close')
        .mockImplementation();

      // done() won't get called
      messageTest({ type: 'other', data: '' } as any, undefined, done);
      expect(consoleSpy).toBeCalledWith('Invalid payload type: other');
      expect(closeSpy).toBeCalledWith(CloseCode.PolicyViolation);
      return done();
    });

    // TODO: Jest doesn't recognize the "else destination" branch in forwardMessage
    it('no peer (error)', () => {
      const masterPeer = new EventEmitter() as websocket.connection;
      const connection = new Connection(masterPeer);
      connection.close = jest.fn();

      masterPeer.emit(
        'message',
        websocket.connection.CLOSE_REASON_NOT_PROVIDED,
        '',
      );

      expect(connection.close).toBeCalledWith(CloseCode.PolicyViolation);
    });
  });

  describe('forwards close event to peer', () => {
    it('drop', (done) => {
      const args: [number, string] = [
        websocket.connection.CLOSE_REASON_ABNORMAL,
        'test',
      ];
      closeTest(...args, 'drop', [...args, true], done);
    });

    it('close', (done) => {
      const args: [number, string] = [
        websocket.connection.CLOSE_REASON_NOT_PROVIDED,
        'test',
      ];
      closeTest(...args, 'close', args, done);
    });
  });

  describe('close', () => {
    it('closes both master and slave peers', () => {
      const masterPeer = ({
        on: jest.fn(),
        close: jest.fn(),
      } as unknown) as websocket.connection;
      const connection = new Connection(masterPeer);

      const slavePeer = ({
        close: jest.fn(),
      } as unknown) as websocket.connection;
      connection['slavePeer'] = slavePeer;

      const code = websocket.connection.CLOSE_REASON_NOT_PROVIDED;
      connection.close(code);
      expect(masterPeer.close).toHaveBeenCalledWith(code);
      expect(slavePeer.close).toHaveBeenCalledWith(code);
    });
  });

  describe('peer', () => {
    it('forwards messages to master (utf8)', (done) => {
      const masterPeer = new EventEmitter() as websocket.connection;

      const payload = { type: 'utf8', utf8Data: 'test' };
      masterPeer.send = (data) => {
        expect(data).toEqual(payload.utf8Data);
        return done();
      };

      const connection = new Connection(masterPeer);
      connection['sendHostHello'] = () => {};

      const slavePeer = new EventEmitter() as websocket.connection;
      connection.connectPeer(slavePeer);

      slavePeer.emit('message', payload);
    });
  });
});

function messageTest(
  payload: websocket.Message,
  receivedData: any,
  done: jest.DoneCallback,
) {
  const masterPeer = new EventEmitter() as websocket.connection;
  const connection = new Connection(masterPeer);

  const peerSendFn = jest.fn().mockImplementation((payload: any) => {
    expect(payload).toEqual(receivedData);
    return done();
  });

  connection['slavePeer'] = ({
    send: peerSendFn,
  } as unknown) as websocket.connection;

  masterPeer.emit('message', payload);
}

function closeTest(
  code: number,
  message: string,
  expectedCloseFn: 'drop' | 'close',
  expectedArgs: any[],
  done: jest.DoneCallback,
) {
  const masterPeer = new EventEmitter() as websocket.connection;
  const connection = new Connection(masterPeer);

  const peerCloseFn = jest
    .fn()
    .mockImplementation((...args: [number, string, boolean]) => {
      expect(args).toEqual(expectedArgs);
      return done();
    });

  connection['slavePeer'] = ({
    [expectedCloseFn]: peerCloseFn,
  } as unknown) as websocket.connection;

  masterPeer.emit('close', code, message);
}
