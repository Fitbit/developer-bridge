import * as stream from 'stream';

import duplexify = require('duplexify');
import * as t from 'io-ts';
import { FDBTypes } from '@fitbit/fdb-protocol';
import {
  MethodCallTimeout,
  ParseJSON,
  Peer,
  RPCError,
  StringifyJSON,
  TypesafeRequestDispatcher,
} from '@fitbit/jsonrpc-ts';

import { Host, HostInfo, InstallHandlerReturn } from '.';

jest.useFakeTimers({ legacyFakeTimers: true });

function wrapPeer(peer: Peer) {
  const parser = new ParseJSON();
  const stringifier = new StringifyJSON();
  parser.pipe(peer).pipe(stringifier);
  return duplexify(parser, stringifier);
}

const hostInfo: HostInfo = {
  device: 'unit-test',
  hostKind: 'device',
  maxMessageSize: 500 * 1024 * 1024,
};

const expectedInstallResult: FDBTypes.AppInstallResult = {
  app: {
    uuid: '14c87333-932e-48b1-9fb7-7e9ba5fcc32e',
    buildID: 'aaaaaaaaaaaaaaaa',
  },
  components: ['app'],
};

let handler: TypesafeRequestDispatcher;
let mockDebugger: Peer;
let mockStream: stream.Duplex;

function createMockHost() {
  return Host.create(mockStream, hostInfo, { timeout: 1000 });
}

beforeEach(() => {
  handler = new TypesafeRequestDispatcher();
  mockDebugger = new Peer(handler);
  mockStream = wrapPeer(mockDebugger);
});

afterEach(() => jest.clearAllTimers());

async function init(capabilities: FDBTypes.HostCapabilities = {}) {
  const host = createMockHost();
  await mockDebugger.callMethod('initialize', { capabilities: {} });
  host.dispatcher.defaultNotificationHandler = (
    method: string,
    params?: { [key: string]: any } | any[],
  ) =>
    // tslint:disable-next-line:max-line-length
    fail(
      `RemoteHost failed to handle notification '${method}' with params\n${JSON.stringify(
        params,
        undefined,
        2,
      )}`,
    );
  return host;
}

describe('create()', () => {
  it('creates an instance of Host with the given hostInfo', () => {
    const host = createMockHost();
    expect(host.capabilities.protocol).toMatchObject({
      maxMessageSize: hostInfo.maxMessageSize,
    });
  });
});

it('handles initialize requests, sends an initialize response', () => {
  const host = createMockHost();
  const initResult = host.handleInitialize({
    capabilities: {},
  });

  expect(initResult.device).toBe('unit-test');
  expect(initResult.hostKind).toBe('device');
});

describe('setInstallHandler', () => {
  let host: Host;
  beforeEach(() => {
    host = createMockHost();
  });

  it('adds io write capability', () => {
    expect(host.capabilities.io).toBeUndefined();
    host.setInstallHandler(() => expectedInstallResult, {});
    expect(host.capabilities.io).toMatchObject({ write: true });
  });

  it('adds sideloadStream capability', () => {
    expect(host.capabilities.appHost).toBeUndefined();
    host.setInstallHandler(() => expectedInstallResult, {});
    expect(host.capabilities.appHost).toMatchObject({
      install: expect.objectContaining({ sideloadStream: true }),
    });
  });

  it('adds given installOption capabilities to setInstallHandler', () => {
    const installOptions = {
      appBundle: true,
      companionBundle: true,
      appCompatibility: [
        {
          family: 'higgs',
          version: '32.1.2',
          maxAPIVersion: '1.0.0',
        },
      ],
      companionCompatibility: {
        maxAPIVersion: '1.2.0',
      },
    };
    expect(host.capabilities.appHost).toBeUndefined();
    host.setInstallHandler(() => expectedInstallResult, installOptions);
    expect(host.capabilities.appHost).toMatchObject({
      install: expect.objectContaining(installOptions),
    });
  });
});

it('responds to ping requests from the debugger', async () => {
  await init();
  return mockDebugger.callMethod('ping');
});

it('handles ping requests', async () => {
  const pingReceived = new Promise((resolve) =>
    handler.method('ping', t.undefined, resolve),
  );
  const host = await init();
  return Promise.all([host.ping(), pingReceived]);
});

it('fails the ping request when the debugger sends an error response', async () => {
  expect.assertions(1);
  handler.method('ping', t.undefined, () => {
    throw new RPCError('fail');
  });
  const host = await init();
  return expect(host.ping()).rejects.toEqual(new Error('fail'));
});

it('fails the ping request when the debugger takes too long to respond', async () => {
  expect.assertions(1);
  handler.method('ping', t.undefined, () => new Promise(() => {}));
  const host = await init();
  const pingResult = host.ping();
  jest.runOnlyPendingTimers();
  return expect(pingResult).rejects.toThrow(MethodCallTimeout);
});

describe('app install', () => {
  let host: Host;
  let mockInstallHandler: jest.Mock<InstallHandlerReturn>;
  let stream: FDBTypes.StreamToken;

  beforeEach(async () => {
    mockInstallHandler = jest.fn().mockReturnValue(expectedInstallResult);
    host = createMockHost();
    host.setInstallHandler(mockInstallHandler, { appBundle: true });
    stream = host.handleAppInstallBegin({ componentBundle: 'app' }).stream;
  });

  describe('begin', () => {
    it('responds with a stream token', () => {
      expect(stream);
    });

    it('throws an error if the app install stream is currently being used', () => {
      expect(() => {
        host.handleAppInstallBegin({ componentBundle: 'app' });
      }).toThrowErrorMatchingSnapshot();
    });
  });

  describe('finalize', () => {
    it('throws if no install handler has been set', () => {
      const host = createMockHost();
      const streamOpenResponse = host.handleAppInstallBegin({
        componentBundle: 'app',
      });
      return expect(
        host.handleAppInstallFinalize({ stream: streamOpenResponse.stream }),
      ).rejects.toMatchSnapshot();
    });

    it('calls the install handler with the finalized stream', async () => {
      await host.handleAppInstallFinalize({ stream });
      expect(mockInstallHandler).toBeCalled();
    });

    it('can start a new install after it has successfully finalized', async () => {
      await host.handleAppInstallFinalize({ stream });
      const newStream = host.handleAppInstallBegin({
        componentBundle: 'app',
      }).stream;
      expect(newStream).not.toEqual(stream);
    });
  });

  describe('abort', () => {
    it('does not call the install handler with the finalized stream', () => {
      host.handleAppInstallAbort({ stream });
      expect(mockInstallHandler).not.toBeCalled();
    });

    it('deletes the current app install stream', () => {
      host.handleAppInstallAbort({ stream });
      expect(() => {
        host.validateAppInstallStream(stream);
      }).toThrowErrorMatchingSnapshot();
    });

    it('can start a new install after it has aborted', async () => {
      await host.handleAppInstallAbort({ stream });
      const newStream = host.handleAppInstallBegin({
        componentBundle: 'app',
      }).stream;
      expect(newStream).not.toEqual(stream);
    });
  });

  describe('validate app install stream', () => {
    it('throws if there is no current app install stream', () => {
      const host = createMockHost();
      expect(() => {
        host.validateAppInstallStream('someToken');
      }).toThrowErrorMatchingSnapshot();
    });

    it('throws if the stream token does not match current app install stream', () => {
      expect(() => {
        host.validateAppInstallStream('badToken');
      }).toThrowErrorMatchingSnapshot();
    });
  });
});

const emittedBy: FDBTypes.InstalledAppComponent = {
  uuid: '5da279b1-e0ca-4958-8946-14036a49fc18',
  buildID: '1234567890abcdef',
  component: 'app',
};

it('sends a console messages', async () => {
  const messageReceived = new Promise((resolve) =>
    handler.notification('console.message', FDBTypes.ConsoleMessage, resolve),
  );
  const baseLog: FDBTypes.ConsoleMessage = {
    emittedBy,
    kind: 'info',
    message: ['Hello', 'world'],
  };

  const host = await init();
  host.consoleMessage(baseLog);

  return messageReceived;
});

it('sends a trace messages', async () => {
  const traceReceived = new Promise((resolve) =>
    handler.notification(
      'console.traceMessage',
      FDBTypes.TraceMessage,
      resolve,
    ),
  );
  const baseTrace: FDBTypes.TraceMessage = {
    emittedBy,
    stack: [],
    kind: 'exception',
    message: ['That thing exploded'],
  };

  const host = await init();
  host.consoleTrace(baseTrace);

  return traceReceived;
});
