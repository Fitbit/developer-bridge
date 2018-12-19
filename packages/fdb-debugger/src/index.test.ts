import crypto = require('crypto');
import stream = require('stream');

import duplexify = require('duplexify');
import * as t from 'io-ts';
import JSZip = require('jszip');

import { FDBTypes } from '@fitbit/fdb-protocol';
import {
  DecodeError,
  ParseJSON,
  Peer,
  RPCError,
  StringifyJSON,
  TypesafeRequestDispatcher ,
} from '@fitbit/jsonrpc-ts';

import { ConsoleMessage, ConsoleTrace, RemoteHost } from '.';

jest.useFakeTimers();

function wrapPeer(peer: Peer) {
  const parser = new ParseJSON;
  const stringifier = new StringifyJSON;
  parser.pipe(peer).pipe(stringifier);
  return duplexify(parser, stringifier);
}

const hostInfo: FDBTypes.InitializeResult = {
  device: 'unit-test',
  hostKind: 'device',
  capabilities: {},
};
let handler: TypesafeRequestDispatcher;
let mockHost: Peer;
let mockStream: stream.Duplex;

beforeEach(() => {
  handler = new TypesafeRequestDispatcher;
  mockHost = new Peer(handler);
  mockStream = wrapPeer(mockHost);
});

afterEach(() => jest.clearAllTimers());

async function init(params?: Partial<FDBTypes.InitializeResult>) {
  handler.method('initialize', FDBTypes.InitializeParams, () => ({ ...hostInfo, ...params }));
  const host = await RemoteHost.connect(mockStream, { timeout: 1000 });
  host.dispatcher.defaultNotificationHandler =
    (method: string, params: { [key: string]: any } | any[]) => (
      // tslint:disable-next-line:max-line-length
      fail(`RemoteHost failed to handle notification '${method}' with params\n${JSON.stringify(params, undefined, 2)}`)
    );
  return host;
}

describe('connect()', () => {
  function waitInit(info: FDBTypes.InitializeResult = hostInfo) {
    return new Promise(resolve => (
      handler.method('initialize', FDBTypes.InitializeParams, (params) => {
        resolve(params);
        return info;
      })
    ));
  }

  it('sends an initialize message', () => {
    return Promise.all([
      expect(RemoteHost.connect(mockStream)).resolves.toEqual(
        expect.objectContaining({ info: hostInfo }),
      ),
      expect(waitInit()).resolves.toEqual(expect.objectContaining({
        userAgent: expect.stringMatching(/^fdb-debugger\/\d+/),
      })),
    ]);
  });

  it('waits a nonzero amount of time for the initialize response', () => {
    waitInit();
    const hostPromise = RemoteHost.connect(mockStream, { timeout: 10000 });
    // The obvious way to test doesn't work because of a Jest bug.
    // https://github.com/facebook/jest/issues/5960
    expect(setTimeout).toHaveBeenLastCalledWith(expect.anything(), 10000);
    return expect(hostPromise).resolves.toEqual(expect.anything());
  });

  it('sends a custom userAgent string', () => {
    return Promise.all([
      RemoteHost.connect(mockStream, {
        userAgentSuffix: 'my-custom-UA/3.14',
      }),
      expect(waitInit()).resolves.toEqual(expect.objectContaining({
        userAgent: expect.stringMatching(
          /^fdb-debugger\/.+ my-custom-UA\/3.14$/,
        ),
      })),
    ]);
  });

  it('rejects a bad initialize response gracefully', () => Promise.all([
    waitInit({ bad: 'result' } as any),
    expect(RemoteHost.connect(mockStream)).rejects.toThrow(DecodeError),
  ]));

  it('switches to CBOR serialization if peer supports it', async () => {
    const changeSerializationParams = new Promise(
      resolve => handler.notification('protocol.serialization.change', t.any, resolve),
    );

    waitInit({
      ...hostInfo,
      capabilities: {
        protocol: {
          additionalSerializations: ['cbor-definite'],
        },
      },
    });
    RemoteHost.connect(mockStream);

    return expect(changeSerializationParams).resolves.toEqual({
      serialization: 'cbor-definite',
    });
  });
});

it('responds to ping requests from the host', async () => {
  await init();
  return mockHost.callMethod('ping');
});

it('handles ping requests', async () => {
  const pingReceived = new Promise(resolve => (
    handler.method('ping', t.undefined, resolve)
  ));
  const remoteHost = await init();
  return Promise.all([
    remoteHost.ping(),
    pingReceived,
  ]);
});

it('fails the ping request when the host sends an error response', async () => {
  expect.assertions(1);
  handler.method('ping', t.undefined, () => {
    throw new RPCError('fail');
  });
  const remoteHost = await init();
  return expect(remoteHost.ping()).rejects.toEqual(new Error('fail'));
});

it('fails the ping request when the host takes too long to respond', async () => {
  expect.assertions(1);
  handler.method('ping', t.undefined, () => new Promise(() => {}));
  const remoteHost = await init();
  const pingResult = remoteHost.ping();
  jest.runOnlyPendingTimers();
  return expect(pingResult).rejects.toEqual(new Error('ping timed out'));
});

it('sideloads an app', async () => {
  const sourceBuffer = crypto.randomBytes(128 * 1024);
  const destBuffers: Buffer[] = [];
  const events: string[] = [];
  const expectedInstallResult: FDBTypes.AppInstallResult = {
    app: {
      uuid: '14c87333-932e-48b1-9fb7-7e9ba5fcc32e',
      buildID: 'aaaaaaaaaaaaaaaa',
    },
    components: ['app'],
    installType: 'full',
  };

  let writeNumber = 0;
  handler
    .method('app.install.stream.begin', FDBTypes.AppInstallStreamBeginParams, (params) => {
      expect(params).toEqual({ componentBundle: 'app' });
      events.push('begin');
      return { stream: 'abcdefg' };
    })
    .method('app.install.stream.finalize', FDBTypes.StreamCloseParams, (params) => {
      events.push('finalize');
      expect(params).toEqual({ stream: 'abcdefg' });
      return expectedInstallResult;
    })
    .method('app.install.stream.abort', FDBTypes.StreamCloseParams, () => {
      events.push('abort');
    })
    .method('io.write', FDBTypes.IOWriteParams, (params) => {
      writeNumber += 1;
      expect(params.stream).toBe('abcdefg');
      destBuffers.push(Buffer.isBuffer(params.data) ?
        params.data : Buffer.from(params.data, 'base64'));
      // Simulate slow but steady write progress.
      return new Promise(resolve => setTimeout(resolve, writeNumber * 900));
    });

  let lastBytesWritten = 0;
  const remoteHost = await init();
  const install = remoteHost.installApp('app', sourceBuffer, {
    onProgress(bytesWritten, totalBytes) {
      expect(bytesWritten).toBeGreaterThan(lastBytesWritten);
      expect(bytesWritten).toBeLessThanOrEqual(totalBytes);
      expect(totalBytes).toBe(sourceBuffer.length);
      lastBytesWritten = bytesWritten;
    },
  });
  // Pump the promise queue in between timers so that timer-triggered
  // promises get a chance to run before the next set of timers expire.
  for (let i = 0; i < 250; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
    await jest.runTimersToTime(100);
  }
  await expect(install).resolves.toEqual(expectedInstallResult);
  expect(events).toEqual(['begin', 'finalize']);
  expect(Buffer.concat(destBuffers)).toEqual(sourceBuffer);
  expect(lastBytesWritten).toBe(sourceBuffer.length);
});

it('forwards the hostID hint to the host when sideloading', async () => {
  const streamBeginParams = new Promise(
    resolve => handler.method('app.install.stream.begin', t.any, (params) => {
      resolve(params);
      throw new RPCError('nah');
    }),
  );

  const remoteHost = await init();
  remoteHost
    .installApp('companion', Buffer.alloc(0))
    .catch(() => {});

  expect(streamBeginParams).resolves.toEqual({
    componentBundle: 'companion',
  });
});

describe('cancels the sideload if the install begin method call', () => {
  const sourceBuffer = Buffer.alloc(128);
  let remoteHost: RemoteHost;
  beforeEach(async () => {
    handler
      .method('io.write', t.any, () => fail('io.write called'))
      .method('app.install.stream.finalize', t.any, () => fail('finalize called'))
      .method('app.install.stream.abort', t.any, () => fail('abort called'));
    remoteHost = await init();
  });

  it('fails', () => {
    handler.method('app.install.stream.begin', t.any, () => {
      throw new RPCError('nope');
    });

    return expect(remoteHost.installApp('app', sourceBuffer))
      .rejects.toEqual(new Error('nope'));
  });

  it('never returns', () => {
    handler.method('app.install.stream.begin', t.any, () => new Promise(() => {}));
    const install = remoteHost.installApp('app', sourceBuffer);
    jest.runOnlyPendingTimers();
    return expect(install).rejects.toEqual(new Error('app.install.stream.begin timed out'));
  });
});

describe('aborts the sideload if', () => {
  const sourceBuffer = Buffer.alloc(16384);
  let aborted: Promise<{}>;
  let remoteHost: RemoteHost;
  beforeEach(async () => {
    aborted = new Promise((resolve, reject) => (
      handler
        .method('app.install.stream.abort', FDBTypes.StreamCloseParams, resolve)
        .method('app.install.stream.finalize', t.any, reject)
    ));
    handler.method('app.install.stream.begin', t.any, () => ({ stream: 1 }));

    remoteHost = await init();
  });

  describe('the first write', () => {
    it('fails', () => {
      handler.method('io.write', t.any, () => {
        throw new RPCError('write failed for some reason');
      });

      return Promise.all([
        expect(remoteHost.installApp('app', sourceBuffer))
          .rejects.toEqual(new Error('write failed for some reason')),
        aborted,
      ]);
    });

    it('never returns', () => {
      handler.method('io.write', t.any, () => {
        jest.runOnlyPendingTimers();
        return new Promise(() => {});
      });

      return Promise.all([
        expect(remoteHost.installApp('app', sourceBuffer))
          .rejects.toEqual(new Error('io.write timed out')),
        aborted,
      ]);
    });
  });

  describe('the second write', () => {
    it('fails', () => {
      let failCountdown = 1;
      handler.method('io.write', t.any, () => {
        if (failCountdown === 0) throw new RPCError('write fail');
        failCountdown -= 1;
      });

      return Promise.all([
        expect(remoteHost.installApp('app', sourceBuffer))
          .rejects.toEqual(new Error('write fail')),
        aborted,
      ]);
    });

    it('never returns', () => {
      let failCountdown = 1;
      handler.method('io.write', t.any, () => {
        if (failCountdown === 0) {
          jest.runOnlyPendingTimers();
          return new Promise(() => {});
        }
        failCountdown -= 1;
      });

      return Promise.all([
        expect(remoteHost.installApp('app', sourceBuffer))
          .rejects.toEqual(new Error('io.write timed out')),
        aborted,
      ]);
    });
  });
});

describe('fails the sideload if the install finalize method call', () => {
  const sourceBuffer = Buffer.alloc(128);
  let remoteHost: RemoteHost;
  beforeEach(async () => {
    handler
      .method('app.install.stream.begin', t.any, () => ({ stream: 1 }))
      .method('io.write', t.any, () => {})
      .method('app.install.stream.abort', t.any, () => fail('abort called'));
    remoteHost = await init();
  });

  it('fails', () => {
    handler.method('app.install.stream.finalize', t.any, () => {
      throw new RPCError('Could not finalize');
    });
    return expect(remoteHost.installApp('app', sourceBuffer))
      .rejects.toEqual(new Error('Could not finalize'));
  });

  it('never returns', () => {
    handler.method('app.install.stream.finalize', t.any, () => {
      setImmediate(() => jest.runOnlyPendingTimers());
      return new Promise(() => {});
    });
    return expect(remoteHost.installApp('app', sourceBuffer))
      .rejects.toEqual(new Error('app.install.stream.finalize timed out'));
  });
});

it('successfully sideloads if the finalize response is slow', async () => {
  const expectedInstallResult: FDBTypes.AppInstallResult = {
    app: {
      uuid: '14c87333-932e-48b1-9fb7-7e9ba5fcc32e',
      buildID: 'aaaaaaaaaaaaaaaa',
    },
    components: ['app'],
    installType: 'full',
  };
  const sourceBuffer = Buffer.alloc(128);
  handler
    .method('app.install.stream.begin', t.any, () => ({ stream: 1 }))
    .method('io.write', t.any, () => {})
    .method('app.install.stream.abort', t.any, () => fail('abort called'))
    .method('app.install.stream.finalize', t.any, () => new Promise(
      resolve => setImmediate(() => {
        jest.runTimersToTime(25000);
        resolve(expectedInstallResult);
      }),
    ));
  const remoteHost = await init();
  return expect(remoteHost.installApp('app', sourceBuffer)).resolves.toEqual(expectedInstallResult);
});

it.each([
  ['full', undefined],
  ['full', 'full'],
  ['partial', 'partial'],
])(
  'normalizes the finalize response to %j when installType is %j',
  async (expected, installType) => {
    const expectedInstallResult: FDBTypes.AppInstallResult = {
      installType,
      app: {
        uuid: '14c87333-932e-48b1-9fb7-7e9ba5fcc32e',
        buildID: 'aaaaaaaaaaaaaaaa',
      },
      components: ['app'],
    };
    const sourceBuffer = Buffer.alloc(128);
    handler
      .method('app.install.stream.begin', t.any, () => ({ stream: 1 }))
      .method('io.write', t.any, () => {})
      .method('app.install.stream.abort', t.any, () => fail('abort called'))
      .method('app.install.stream.finalize', t.any, () => expectedInstallResult);
    const remoteHost = await init();
    return expect(remoteHost.installApp('app', sourceBuffer)).resolves.toMatchObject({
      installType: expected,
    });
  },
);

it('gracefully handles the install abort method call never returning', async () => {
  const abortMethod = jest.fn(() => {
    setImmediate(() => jest.runOnlyPendingTimers());
    return new Promise(() => {});
  });

  handler
    .method('app.install.stream.begin', t.any, () => ({ stream: 1 }))
    .method('io.write', t.any, () => {
      throw new RPCError('Write not happening today');
    })
    .method('app.install.stream.finalize', t.any, () => fail('finalize called'))
    .method('app.install.stream.abort', t.any, abortMethod);

  const remoteHost = await init();
  await expect(remoteHost.installApp('app', Buffer.alloc(128)))
    .rejects.toEqual(new Error('Write not happening today'));
  expect(abortMethod).toHaveBeenCalled();
});

const emittedBy = {
  uuid: '5da279b1-e0ca-4958-8946-14036a49fc18',
  buildID: '1234567890abcdef',
  component: 'app',
};

describe('emits console messages', () => {
  let logEvent: Promise<ConsoleMessage>;
  beforeEach(async () => {
    const remoteHost = await init();
    remoteHost.epoch = new Date(2000, 1, 1);
    logEvent = new Promise<ConsoleMessage>(resolve => (
      remoteHost.once('consoleMessage', resolve)
    ));
  });

  const baseLog = {
    emittedBy,
    kind: 'info',
    message: ['Hello', 'world'],
  };

  it('with no timestamp', () => {
    mockHost.sendNotification('console.message', baseLog);
    return expect(logEvent).resolves.toEqual(baseLog);
  });

  it('with timestamp, converted to a Date', () => {
    mockHost.sendNotification('console.message', {
      ...baseLog,
      timestamp: 301.2,
    });
    return expect(logEvent).resolves.toEqual(expect.objectContaining({
      timestamp: new Date(2000, 1, 1, 0, 5, 1, 200),
    }));
  });
});

describe('emits trace messages', () => {
  let traceEvent: Promise<ConsoleTrace>;
  beforeEach(async () => {
    const remoteHost = await init();
    remoteHost.epoch = new Date(2000, 1, 1);
    traceEvent = new Promise<ConsoleTrace>(resolve => (
      remoteHost.once('consoleTrace', resolve)
    ));
  });

  const baseTrace = {
    emittedBy,
    stack: [],
    kind: 'exception',
    message: ['That thing exploded'],
  };

  it('with no timestamp', () => {
    mockHost.sendNotification('console.traceMessage', baseTrace);
    return expect(traceEvent).resolves.toEqual(baseTrace);
  });

  it('with timestamp, converted to a Date', () => {
    mockHost.sendNotification('console.traceMessage', {
      ...baseTrace,
      timestamp: 2 * 3600 + 15 * 60 + 32 + 0.5,
    });
    return expect(traceEvent).resolves.toEqual(expect.objectContaining({
      timestamp: new Date(2000, 1, 1, 2, 15, 32, 500),
    }));
  });
});

describe('when the host does not support screenshots', () => {
  let remoteHost: RemoteHost;
  beforeEach(async () => {
    remoteHost = await init();
  });

  it('returns false for canTakeScreenshot()', () => {
    expect(remoteHost.canTakeScreenshot()).toBe(false);
  });

  it('returns an empty array for screenshot formats', () => {
    expect(remoteHost.screenshotFormats()).toEqual([]);
  });
});

describe('when the host advertises the streamed screenshot capability', () => {
  const imageFormats = ['P6.sRGB', 'PNG'];
  let remoteHost: RemoteHost;

  beforeEach(async () => {
    remoteHost = await init({ capabilities: { appHost: {
      screenshot: {
        imageFormats,
        stream: true,
      },
    }}});
  });

  it('returns true for canTakeScreenshot()', () => {
    expect(remoteHost.canTakeScreenshot()).toBe(true);
  });

  it('reports the screenshot formats the host supports', () => {
    expect(remoteHost.screenshotFormats()).toEqual(imageFormats);
  });
});

describe('when a screenshot stream capture request returns an error response', () => {
  let remoteHost: RemoteHost;
  let streamToken: FDBTypes.StreamToken;

  beforeEach(async () => {
    handler.method(
      'app.screenshot.stream.capture',
      FDBTypes.AppScreenshotStreamCaptureParams,
      ({ stream }: FDBTypes.AppScreenshotStreamCaptureParams) => {
        streamToken = stream;
        throw new RPCError('Camera shy');
      });
    remoteHost = await init();
  });

  it('rejects the screenshot promise', () => (
    expect(remoteHost.takeScreenshot('aaa')).rejects.toEqual(new RPCError('Camera shy'))
  ));

  it('closes the stream', async () => {
    try {
      await remoteHost.takeScreenshot('foo');
    } catch (e) {}
    return expect(mockHost.callMethod('io.write', { stream: streamToken, data: '' }))
      .rejects.toEqual(expect.objectContaining({ message: 'Unknown bulk data stream' }));
  });
});

describe('when taking a screenshot', () => {
  let remoteHost: RemoteHost;

  beforeEach(async () => {
    remoteHost = await init();
  });

  const beginCapture = (onWrite?: () => void, length?: number) => {
    let screenshot: Promise<Buffer>;

    const capture = new Promise<{
      stream: FDBTypes.StreamToken,
      screenshot: Promise<Buffer>,
    }>(
      resolve => handler.method(
        'app.screenshot.stream.capture',
        FDBTypes.AppScreenshotStreamCaptureParams,
        (params: FDBTypes.AppScreenshotStreamCaptureParams) => {
          setImmediate(() => resolve({
            screenshot,
            stream: params.stream,
          }));
          return { length };
        },
      ),
    );

    screenshot = remoteHost.takeScreenshot('foo', onWrite);
    return capture;
  };

  describe('when the total size is unknown', () => {
    it('calls the onWrite callback with the write size', async () => {
      const onWrite = jest.fn();
      const { stream } = await beginCapture(onWrite);
      await mockHost.callMethod('io.write', { stream, data: 'asdf' });
      await mockHost.callMethod('io.write', { stream, data: 'asdf' });
      expect(onWrite.mock.calls).toEqual([
        [3, undefined],
        [6, undefined],
      ]);
    });
  });

  describe('when the total size is known', () => {
    it('calls the onWrite callback with the write size and total', async () => {
      const onWrite = jest.fn();
      const { stream } = await beginCapture(onWrite, 6);
      await mockHost.callMethod('io.write', { stream, data: 'asdf' });
      await mockHost.callMethod('io.write', { stream, data: 'asdf' });
      expect(onWrite.mock.calls).toEqual([
        [3, 6],
        [6, 6],
      ]);
    });
  });

  describe('when the screenshot is fully transferred', () => {
    let stream: FDBTypes.StreamToken;
    let screenshot: Promise<Buffer>;

    beforeEach(async () => {
      ({ stream, screenshot } = await beginCapture());
      await Promise.all(
        ['foo', 'bar', 'baz'].map(
          str => mockHost.callMethod('io.write', {
            stream,
            data: Buffer.from(str).toString('base64'),
          }),
        ),
      );
      await mockHost.callMethod('app.screenshot.stream.finalize', { stream });
    });

    it('resolves the promise', () => (
      expect(screenshot).resolves.toEqual(Buffer.from('foobarbaz'))
    ));

    it('cleans up the bulk transfer stream', async () => {
      await screenshot;
      return expect(mockHost.callMethod('io.write', { stream, data: '' }))
        .rejects.toEqual(
          expect.objectContaining({
            message: 'Unknown bulk data stream',
          }),
        );
    });
  });

  describe('when the screenshot is aborted', () => {
    let stream: FDBTypes.StreamToken;
    let screenshot: Promise<Buffer>;

    beforeEach(async () => {
      ({ stream, screenshot } = await beginCapture());
      await mockHost.callMethod('io.write', { stream, data: 'fooo' });
      await mockHost.callMethod('app.screenshot.stream.abort', { stream });
    });

    it('rejects the promise', () => (
      expect(screenshot).rejects.toEqual('Aborted by host')
    ));

    it('cleans up the bulk transfer stream', async () => {
      try { await screenshot; } catch (e) {}
      return expect(mockHost.callMethod('io.write', { stream, data: '' }))
        .rejects.toEqual(
          expect.objectContaining({
            message: 'Unknown bulk data stream',
          }),
        );
    });
  });
});

it('handles attempts to finalize a nonexistent screenshot stream', async () => {
  await init();
  return expect(mockHost.callMethod('app.screenshot.stream.finalize', { stream: 'foo' }))
    .rejects.toEqual(expect.objectContaining({
      message: 'Stream token does not match any open screenshot stream',
    }));
});

it('handles attempts to abort a nonexistent screenshot stream', async () => {
  await init();
  return expect(mockHost.callMethod('app.screenshot.stream.abort', { stream: 'foo' }))
    .rejects.toEqual(expect.objectContaining({
      message: 'Stream token does not match any open screenshot stream',
    }));
});

const hostWithEvalSupport = (supported = true) => ({
  capabilities: { appHost: { debug: { app: { evalToString: { supported } } } } },
});

it.each([
  hostWithEvalSupport(),
  { ...hostWithEvalSupport(), device: 'Higgs 27.33.2.30' },
  { ...hostWithEvalSupport(), device: 'Meson 27.34.1.1' },
])('detects when the host supports eval %#', async (response) => {
  const host = await init(response);
  expect(host.hasEvalSupport()).toBe(true);
});

it.each([
  {},
  hostWithEvalSupport(false),
  { ...hostWithEvalSupport(), device: 'Higgs 27.33.1.30' },
  { ...hostWithEvalSupport(), device: 'Meson 27.33.1.31' },
])('detects when the host does not support eval %#', async (response) => {
  const host = await init(response);
  expect(host.hasEvalSupport()).toBe(false);
});

describe('when fetching an app contents list', () => {
  const mockUUID = 'f2f45a85-2b58-4388-bb83-5e3ea770d222';
  let remoteHost: RemoteHost;
  let fetchRequest: FDBTypes.AppComponentContentsRequest;
  let contents: Promise<FDBTypes.AppComponentContentsList>;

  beforeEach(async () => {
    remoteHost = await init();
    const fetcher = new Promise<FDBTypes.AppComponentContentsRequest>(
      resolve => handler.method(
        'app.contents.stream.list',
        FDBTypes.AppComponentContentsRequest,
        resolve,
      ),
    );

    contents = remoteHost.getInstalledAppContents(mockUUID, 'app');
    return fetcher.then((req) => { fetchRequest = req; });
  });

  const write = async (data: string) => {
    await mockHost.callMethod('io.write', {
      stream: fetchRequest.stream,
      data: Buffer.from(data).toString('base64'),
    });
    await mockHost.callMethod('app.contents.stream.finalize', { stream: fetchRequest.stream });
  };

  it('passes through the request params', () => {
    expect(fetchRequest).toMatchObject({
      uuid: mockUUID,
      componentBundle: 'app',
    });
  });

  describe('when the request succeeds', () => {
    const mockContentsList: FDBTypes.AppComponentContentsList = {
      files: {
        'manifest.json': {
          sha256: crypto.createHash('sha256').update('foo').digest('base64'),
        },
        'app/index.js': {
          sha256: crypto.createHash('sha256').update('bar').digest('base64'),
        },
      },
    };

    beforeEach(() => write(JSON.stringify(mockContentsList)));

    it('returns the list as a JS object', () =>
      expect(contents).resolves.toEqual(mockContentsList));
  });

  describe('when the returned data is not valid JSON', () => {
    beforeEach(() => write('{"foo":'));

    it('rejects with a useful error', () =>
      expect(contents).rejects.toThrowError('Unexpected end of JSON input'));
  });

  describe('when the returned data is not compliant with the schema', () => {
    beforeEach(() => write(JSON.stringify({ files: { foo: { bar: '' } } })));

    it('rejects with a decode error', () =>
      expect(contents).rejects.toThrow(DecodeError));
  });
});

describe('when fetching the contents list of an app that is not installed', () => {
  let remoteHost: RemoteHost;

  beforeEach(async () => {
    remoteHost = await init();
    handler.method(
      'app.contents.stream.list',
      t.any,
      () => Promise.reject(new RPCError('That app is not installed', -1)),
    );
  });

  it('rejects with a useful error', () =>
    expect(remoteHost.getInstalledAppContents('some-uuid', 'app'))
      .rejects.toThrowError('That app is not installed'));
});

describe('if the host does not support partial app installs', () => {
  let remoteHost: RemoteHost;

  beforeEach(async () => {
    remoteHost = await init({ capabilities: { appHost: { install: { partialBundle: false } } } });
  });

  test('supportsPartialAppInstall() returns false', () =>
    expect(remoteHost.supportsPartialAppInstall()).toBe(false));

  it('makes no attempt to get installed app contents before installing', (done) => {
    handler
      .method(
        'app.contents.stream.list',
        t.any,
        () => done.fail('Unexpected call to app.contents.stream.list method'),
      )
      .method(
        'app.install.stream.begin',
        t.any,
        () => done(),
      );

    const appZip = new JSZip();
    appZip.file('manifest.json', JSON.stringify({ uuid: 'some-uuid' }));
    appZip.generateAsync({ type: 'nodebuffer' })
      .then(bundle => remoteHost.installApp('app', bundle).catch(() => {}));
  });
});

const mockAppInstallResult: FDBTypes.AppInstallResult = {
  app: { uuid: 'f058fd00-80f4-4097-be75-e726c9d7e624', buildID: '0123456789abcdef' },
  components: [],
};

describe('if the host supports partial app installs', () => {
  let remoteHost: RemoteHost;

  beforeEach(async () => {
    remoteHost = await init({ capabilities: { appHost: { install: { partialBundle: true } } } });
  });

  test('supportsPartialAppInstall() returns true', () =>
    expect(remoteHost.supportsPartialAppInstall()).toBe(true));

  const doInstall = (sourceBundle: Buffer, streamList: () => any) => {
    const installBuffers: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      remoteHost.getInstalledAppContents = () => {
        if (streamList) return new Promise(resolve => resolve(streamList()));
        reject('unexpected call to getInstalledAppContents');
        return Promise.reject(new Error('unexpected call'));
      };

      handler
        .method('app.install.stream.begin', t.any, () => ({ stream: 1 }))
        .method('io.write', FDBTypes.IOWriteParams, ({ data }) =>
          installBuffers.push(Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64')))
        .method('app.install.stream.finalize', t.any, () => {
          resolve(Buffer.concat(installBuffers));
          return mockAppInstallResult;
        });

      remoteHost.installApp('app', sourceBundle);
    });
  };

  it.each([
    ['bundle is not a zip file', () => Buffer.from([1, 2, 3]), undefined],
    [
      'uuid cannot be read from bundle',
      () => {
        const zip = new JSZip();
        zip.file('manifest.json', '{}');
        return zip.generateAsync({ type: 'nodebuffer' });
      },
      undefined,
    ],
    [
      'full install is more optimal than partial',
      () => {
        const zip = new JSZip();
        zip.file('manifest.json', JSON.stringify({ uuid: 'foo' }));
        zip.file('app.js', 'foo');
        return zip.generateAsync({ type: 'nodebuffer' });
      },
      () => ({
        files: {
          'manifest.json': { sha256: 'abcd' },
          'app.js': { sha256: 'abcd' },
        },
      }),
    ],
    [
      'app is being freshly installed',
      () => {
        const zip = new JSZip();
        zip.file('manifest.json', JSON.stringify({ uuid: 'foo' }));
        return zip.generateAsync({ type: 'nodebuffer' });
      },
      () => { throw new RPCError('no such app', -1); },
    ],
  ])(
      'falls back to full install if %s',
      async (_, bundle: () => Buffer | Promise<Buffer>, streamList: () => any) => {
        const sourceBundle = await bundle();
        expect((await doInstall(sourceBundle, streamList)).compare(sourceBundle)).toBe(0);
      });

  it('elides the install if the install would be a no-op', async () => {
    const fileContents = JSON.stringify({ uuid: 'the-uuid' });
    const fileInfo = { sha256: crypto.createHash('sha256').update(fileContents).digest('hex') };
    const contentsList = {
      files: {
        'manifest.json': fileInfo,
        'app.js': fileInfo,
      },
    };

    const zip = new JSZip();
    zip.file('manifest.json', fileContents);
    zip.file('app.js', fileContents);
    const bundle = await zip.generateAsync({ type: 'nodebuffer' });

    remoteHost.getInstalledAppContents = () => Promise.resolve(contentsList);

    // This would reject if it called app.install.stream.begin since no
    // handler is registered.
    return remoteHost.installApp('app', bundle);
  });

  it('installs the partial bundle', async () => {
    const fileContents = JSON.stringify({ uuid: 'the-uuid' });
    const fileInfo = { sha256: crypto.createHash('sha256').update(fileContents).digest('hex') };
    const contentsList = {
      files: {
        'manifest.json': fileInfo,
        'app.js': fileInfo,
      },
    };

    const zip = new JSZip();
    zip.file('manifest.json', fileContents);
    zip.file('app.js', fileContents);
    zip.file('new.js', 'this is a new file');
    const bundle = await zip.generateAsync({ type: 'nodebuffer' });

    const installedBundle = await doInstall(bundle, () => contentsList);
    expect(bundle.compare(installedBundle)).not.toBe(0);

    const installedZip = await JSZip.loadAsync(installedBundle);
    const installedFiles: string[] = [];
    installedZip.forEach((path, file) => { if (!file.dir) installedFiles.push(path); });
    expect(installedFiles.sort()).toEqual([
      '.partial.json',
      'manifest.json',
      'new.js',
    ].sort());
  });
});
