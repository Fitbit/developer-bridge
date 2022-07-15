import { EventEmitter } from 'events';
import * as stream from 'stream';

import * as t from 'io-ts';
import {
  decode,
  ParseJSON,
  Peer,
  TypesafeRequestDispatcher,
} from '@fitbit/jsonrpc-ts';
import { BulkData, FDBTypes, maxBase64DecodedSize } from '@fitbit/fdb-protocol';
import * as lodash from 'lodash';
import JSZip = require('jszip');

import { version } from '../package.json';
import BulkDataReceiver from './BulkDataReceiver';
import ConfigurableEncode from './ConfigurableEncode';
import { getAppUUID, makePartialBundle } from './componentBundle';

export interface RemoteHostOptions {
  /** Suffix to append to the debugger userAgent string. */
  userAgentSuffix?: string;
}

export interface ConsoleMessage {
  timestamp?: Date;
  emittedBy: FDBTypes.AppComponent;
  fromHost?: boolean;
  position?: FDBTypes.Position;
  kind: 'log' | 'info' | 'warn' | 'error';
  message: any[];
}

export interface ConsoleTrace {
  timestamp?: Date;
  emittedBy: FDBTypes.AppComponent;
  stack: FDBTypes.Position[];
  kind: 'trace' | 'assert' | 'exception';
  message: any[];
}

/**
 * Fitbit OS 3.0 does not fully support REPL despite claiming support via the capability
 * Fitbit developers see bug: FW-65649
 */
const FBOS3_EVAL_QUIRK = /^[a-zA-Z]+ \d+\.33\.1\.[1-3]?\d$/;

export class RemoteHost extends EventEmitter {
  static readonly CAPABILITIES = {
    protocol: { maxMessageSize: 1024 * 1024 },
    console: { appLogging: true },
    io: { write: true },
  };

  static readonly USER_AGENT = `fdb-debugger/${version}`;

  dispatcher = new TypesafeRequestDispatcher();

  /** JSON-RPC peer connection to the remote host. */
  rpc = new Peer(this.dispatcher);

  /** Host's initialization info. */
  info!: FDBTypes.InitializeResult;

  /** The local clock timestamp of the (approximate) epoch for the Host. */
  epoch!: Date;

  /** Milliseconds to wait before giving up on a method call. */
  timeout: number;

  /** Open bulk data transfer streams. */
  protected bulkDataStreams = new BulkData();
  private screenshotReceiver = new BulkDataReceiver(
    this.bulkDataStreams,
    'screenshot',
  );
  private appContentsListReceiver = new BulkDataReceiver(
    this.bulkDataStreams,
    'app component contents list',
  );
  private heapSnapshotReceiver = new BulkDataReceiver(
    this.bulkDataStreams,
    'heap snapshot',
  );
  private serializerTransform = new ConfigurableEncode();

  protected constructor(timeout: number) {
    super();
    this.timeout = timeout;
    this.dispatcher
      .method('ping', t.undefined, () => {})
      .notification(
        'console.message',
        FDBTypes.ConsoleMessage,
        this.handleMessage,
      )
      .notification(
        'console.traceMessage',
        FDBTypes.TraceMessage,
        this.handleTrace,
      )
      .notification(
        'experimental.lifecycle.appRunning',
        FDBTypes.App,
        this.handleAppRunning,
      )
      .notification(
        'experimental.lifecycle.appClosed',
        FDBTypes.App,
        this.handleAppClosed,
      );
    this.bulkDataStreams.register(this.dispatcher);
    this.screenshotReceiver.registerCloserMethods(
      this.dispatcher,
      'app.screenshot.stream',
    );
    this.appContentsListReceiver.registerCloserMethods(
      this.dispatcher,
      'app.contents.stream',
    );
    this.heapSnapshotReceiver.registerCloserMethods(
      this.dispatcher,
      'app.debug.heapSnapshot',
    );
  }

  /**
   * Initialize a connection to a remote debug bridge host.
   *
   * @param hostStream stream for communicating with the host
   * @param options connection options
   */
  static async connect(
    hostStream: stream.Duplex,
    {
      userAgentSuffix = '',
      timeout = 10000,
      postDeserializeTransform = new stream.PassThrough({ objectMode: true }),
      preSerializeTransform = new stream.PassThrough({ objectMode: true }),
    } = {},
  ) {
    let userAgent = this.USER_AGENT;
    if (userAgentSuffix) {
      userAgent = `${userAgent} ${userAgentSuffix}`;
    }

    const host = new this(timeout);
    hostStream
      .pipe(new ParseJSON())
      .pipe(postDeserializeTransform)
      .pipe(host.rpc)
      .pipe(preSerializeTransform)
      .pipe(host.serializerTransform)
      .pipe(hostStream);
    const reqTime = Date.now();
    host.info = await host.initialize({
      userAgent,
      capabilities: this.CAPABILITIES,
    });

    if (
      host.hasCapability('protocol.additionalSerializations') &&
      host.info.capabilities.protocol!.additionalSerializations!.includes(
        'cbor-definite',
      )
    ) {
      host.changeSerialization('cbor-definite');
    }

    /**
     * Half-decent guess of the connection epoch in the local clock
     * domain, assuming that the send and receive latency is symmetric,
     * and that the host responds immediately to the request.
     */
    host.epoch = new Date((reqTime + Date.now()) / 2);
    return host;
  }

  /**
   * Convert a host-relative timestamp to a Date in the local clock domain.
   */
  convertTimestamp(relativeTS: number) {
    return new Date(this.epoch.getTime() + relativeTS * 1000);
  }

  handleMessage = (params: FDBTypes.ConsoleMessage) => {
    if (params.timestamp) {
      this.emit('consoleMessage', {
        ...params,
        timestamp: this.convertTimestamp(params.timestamp),
      });
    } else {
      this.emit('consoleMessage', params);
    }
  };

  handleTrace = (params: FDBTypes.TraceMessage) => {
    if (params.timestamp) {
      this.emit('consoleTrace', {
        ...params,
        timestamp: this.convertTimestamp(params.timestamp),
      });
    } else {
      this.emit('consoleTrace', params);
    }
  };

  handleAppRunning = (params: FDBTypes.App) => {
    this.emit('appRunning', params);
  };

  handleAppClosed = (params: FDBTypes.App) => {
    this.emit('appClosed', params);
  };

  /**
   * Query whether the Host advertises a capability.
   *
   * @param path capability path, e.g. 'appHost.install.sideloadStream'
   */
  hasCapability(path: string) {
    return lodash.get(this.info.capabilities, path) !== undefined;
  }

  /**
   * The max message size that the remote host will accept, in bytes.
   */
  get maxMessageSize() {
    const protocolDefaultSize = 8192; // Assuming WebSocket
    const capabilitySize: number = lodash.get(
      this.info.capabilities,
      'protocol.maxMessageSize',
      0,
    );
    return Math.max(protocolDefaultSize, capabilitySize);
  }

  /**
   * Bind an RPC method on the remote host with type-checking of the
   * method's response result. If the response result does not pass
   * verification, the method call promise is rejected with a TypeError.
   *
   * @param method RPC method to bind
   * @param paramsType io-ts type of the RPC method params
   * @param resultType io-ts type of the RPC response result
   */
  protected bindMethod<P extends t.Any, R extends t.Any>(
    method: string,
    paramsType: P,
    resultType: R,
    { timeoutEnabled = true, minTimeout = 0 } = {},
  ): (params: t.TypeOf<P>) => Promise<t.TypeOf<R>> {
    return (params: t.TypeOf<P>) =>
      this.rpc
        .callMethod(method, params, {
          timeout: timeoutEnabled
            ? Math.max(this.timeout, minTimeout)
            : undefined,
        })
        .then(decode(resultType));
  }

  private initialize = this.bindMethod(
    'initialize',
    FDBTypes.InitializeParams,
    FDBTypes.InitializeResult,
  );

  /**
   * Ping the remote host.
   */
  ping = (): Promise<void> =>
    this.rpc.callMethod('ping', undefined, { timeout: this.timeout });

  protected ioWrite = this.bindMethod(
    'io.write',
    FDBTypes.IOWriteParams,
    t.any,
    { timeoutEnabled: false },
  );

  protected beginStreamingInstall = this.bindMethod(
    'app.install.stream.begin',
    FDBTypes.AppInstallStreamBeginParams,
    FDBTypes.StreamOpenResponse,
  );

  protected finalizeStreamingInstall = this.bindMethod(
    'app.install.stream.finalize',
    FDBTypes.StreamCloseParams,
    FDBTypes.AppInstallResult,
    { minTimeout: 300000 },
  );

  protected abortStreamingInstall = this.bindMethod(
    'app.install.stream.abort',
    FDBTypes.StreamCloseParams,
    t.any,
  );

  /** Request that the host launch an installed app component. */
  launchAppComponent = this.bindMethod(
    'app.launchComponent',
    FDBTypes.LaunchComponentParams,
    FDBTypes.AppComponent,
    { minTimeout: 15000 },
  );

  private changeSerialization = (serialization: FDBTypes.SerializationType) => {
    this.rpc.sendNotification('protocol.serialization.change', {
      serialization,
    });
    this.serializerTransform.setEncoder(serialization);
  };

  protected async writeToStream(
    stream: FDBTypes.StreamToken,
    data: Buffer,
    {
      onProgress = (() => {}) as (
        bytesWritten: number,
        totalBytes: number,
      ) => void,
    } = {},
  ) {
    /**
     * How much data can we send in each io.write call?
     * Depends on the overhead. Thanks to my brilliant idea of loosely
     * coupling the JSON-RPC protocol implementation from the serializer,
     * there isn't a way to find out how big a message will be. But wait,
     * there's more! The request ID and stream ID fields could be of
     * arbitrary length. And the outgoing JSON could be pretty-printed.
     *
     * Rather than come up with some rigorous method to determine exactly how
     * many bytes of overhead a specific message is going to end up with so
     * that each io.write can be packed to max size, let's just guesstimate
     * a value for overhead and add some headroom to make it extremely unlikely
     * that a write is not going to go over.
     *
     *     > JSON.stringify({
     *     ... jsonrpc: '2.0', id: Number.MIN_SAFE_INTEGER,
     *     ... method: 'io.write', params: {
     *     ...   stream: Number.MIN_SAFE_INTEGER,
     *     ...   data: '',
     *     ...   encoding: 'base64',
     *     ... }).length;
     * 128
     *
     * A JSON-RPC io.write request with max-length numeric request and stream
     * IDs and no pretty-printing is 128 chars long (which in this case is
     * equal to 128 bytes of UTF-8). So let's double that to 256 bytes of
     * potential overhead to deal with any overhead from pretty-printing the
     * JSON and long string IDs and call it a day.
     */
    const overheadChars = 256;

    const maxDataBytes = maxBase64DecodedSize(
      this.maxMessageSize - overheadChars,
    );
    if (maxDataBytes < 1) {
      throw new Error('Cannot fit any data into an io.write message');
    }

    let expireWriteTimeout: (reason: any) => void;
    const writeTimedOut = new Promise((_, reject) => {
      expireWriteTimeout = () => {
        reject(new Error('io.write timed out'));
      };
    });

    let timeoutTimer = setTimeout(expireWriteTimeout!, this.timeout);
    const resetWriteTimeout = () => {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(expireWriteTimeout, this.timeout);
    };

    /**
     * It would be much more intelligent to only have a small number of
     * write requests in-flight at once so that we can fail fast and not
     * have to wait for all the remaining buffered requests to be sent.
     * But that's a lot more complicated to write than the naive
     * machine-gun approach.
     */
    const writes: Promise<any>[] = [];
    for (let cursor = 0; cursor < data.length; cursor += maxDataBytes) {
      const chunk: FDBTypes.IOWriteParams =
        this.serializerTransform.canAcceptRawBuffers()
          ? {
              stream,
              data: data.slice(cursor, cursor + maxDataBytes),
              encoding: 'none',
            }
          : {
              stream,
              data: data.toString('base64', cursor, cursor + maxDataBytes),
            };

      writes.push(
        this.ioWrite(chunk).then(() => {
          resetWriteTimeout();
          onProgress(Math.min(cursor + maxDataBytes, data.length), data.length);
        }),
      );
    }
    await Promise.race([Promise.all(writes), writeTimedOut]);
    clearTimeout(timeoutTimer);
  }

  async installApp(
    componentBundle: 'app' | 'companion',
    data: Buffer,
    {
      onProgress = (() => {}) as (
        bytesWritten: number,
        totalBytes: number,
      ) => void,
    } = {},
  ) {
    let bundleData = data;

    if (this.supportsPartialAppInstall()) {
      try {
        const bundleZip = await JSZip.loadAsync(data);
        const uuid = await getAppUUID(bundleZip);
        const existingContents = await this.getInstalledAppContents(
          uuid,
          componentBundle,
        );
        const partialBundle = await makePartialBundle(
          bundleZip,
          existingContents,
        );

        if (partialBundle == null) {
          // Nothing to do! The bundle is already installed.
          return null;
        }

        bundleData = partialBundle;
      } catch {
        // Install like normal.
      }
    }

    const { stream } = await this.beginStreamingInstall({ componentBundle });
    try {
      await this.writeToStream(stream, bundleData, { onProgress });
    } catch (e) {
      this.abortStreamingInstall({ stream });
      throw e;
    }
    return this.finalizeStreamingInstall({ stream }).then((result) => ({
      installType: 'full' as FDBTypes.InstallType,
      ...result,
    }));
  }

  protected beginStreamingScreenshotCapture = this.bindMethod(
    'app.screenshot.stream.capture',
    FDBTypes.AppScreenshotStreamCaptureParams,
    FDBTypes.AppScreenshotStreamCaptureResult,
  );

  canTakeScreenshot() {
    return (
      this.hasCapability('appHost.screenshot') &&
      !!this.info.capabilities.appHost!.screenshot!.stream
    );
  }

  screenshotFormats() {
    if (!this.canTakeScreenshot()) return [];
    return this.info.capabilities.appHost!.screenshot!.imageFormats;
  }

  takeScreenshot(
    format: string,
    onWrite?: (received: number, total?: number) => void,
  ) {
    return this.screenshotReceiver.receiveFromStream((stream) =>
      this.beginStreamingScreenshotCapture({
        stream: stream.token,
        imageFormat: format,
      }).then(({ length }) => {
        if (onWrite) {
          stream.onWrite = (_, received) => onWrite(received, length);
        }
      }),
    );
  }

  private sendEvalCmd = this.bindMethod(
    'app.debug.evalToString',
    FDBTypes.AppDebugEvalParams,
    FDBTypes.AppDebugEvalResult,
  );

  hasEvalSupport() {
    return (
      this.hasCapability('appHost.debug.app.evalToString.supported') &&
      this.info.capabilities.appHost!.debug!.app!.evalToString!.supported &&
      !FBOS3_EVAL_QUIRK.test(this.info.device)
    );
  }

  eval(cmd: string, uuid?: FDBTypes.UUID) {
    return this.sendEvalCmd(uuid ? { cmd, uuid } : { cmd });
  }

  supportsPartialAppInstall() {
    return (
      this.hasCapability('appHost.install.partialBundle') &&
      this.info.capabilities.appHost!.install!.partialBundle!
    );
  }

  protected beginStreamingAppComponentContents = this.bindMethod(
    'app.contents.stream.list',
    FDBTypes.AppComponentContentsRequest,
    t.any,
  );

  getInstalledAppContents(
    uuid: string,
    componentBundle: FDBTypes.ComponentBundleKind,
  ) {
    return this.appContentsListReceiver
      .receiveFromStream((stream) =>
        this.beginStreamingAppComponentContents({
          componentBundle,
          uuid,
          stream: stream.token,
        }),
      )
      .then((buffer) => JSON.parse(buffer.toString()))
      .then(decode(FDBTypes.AppComponentContentsList));
  }

  getHeapSnapshotSupport(): {
    supported: boolean;
    requiresInstrumentedLaunch: boolean;
    formats: string[];
  } {
    return {
      supported: false,
      requiresInstrumentedLaunch: false,
      formats: [],
      ...(this.hasCapability('appHost.debug.app.heapSnapshot') &&
        this.info.capabilities.appHost!.debug!.app!.heapSnapshot!),
    };
  }

  protected beginHeapSnapshotCapture = this.bindMethod(
    'app.debug.heapSnapshot.capture',
    FDBTypes.AppHeapSnapshotRequest,
    t.any,
  );

  captureHeapSnapshot(format: string, uuid?: FDBTypes.UUID) {
    return this.heapSnapshotReceiver.receiveFromStream((stream) =>
      this.beginHeapSnapshotCapture(
        uuid
          ? { format, uuid, stream: stream.token }
          : { format, stream: stream.token },
      ),
    );
  }
}
