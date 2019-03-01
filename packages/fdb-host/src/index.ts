import { EventEmitter } from 'events';
import * as stream from 'stream';

import * as t from 'io-ts';
import {
  InvalidParams,
  ParseJSON,
  Peer,
  StringifyJSON,
  TypesafeRequestDispatcher,
} from '@fitbit/jsonrpc-ts';

import {
  BulkData,
  BulkDataStream,
  FDBTypes,
} from '@fitbit/fdb-protocol';

export interface HostInfo {
  device: string;
  hostKind: 'device' | 'companion';
  maxMessageSize?: number;
}

export interface InstallOptions {
  appBundle?: boolean;
  companionBundle?: boolean;
  appCompatibility?: FDBTypes.AppHostDescriptor[];
  companionCompatibility?: FDBTypes.CompanionHostDescriptor;
}

export type InstallHandlerReturn = FDBTypes.AppInstallResult | Promise<FDBTypes.AppInstallResult>;

export type InstallHandler = (appData: Buffer) => InstallHandlerReturn;

export class Host extends EventEmitter {
  capabilities: FDBTypes.HostCapabilities;

  dispatcher = new TypesafeRequestDispatcher();

  /** JSON-RPC peer connection to the remote host. */
  rpc = new Peer(this.dispatcher);

  /** Debuggers's initialization info. */
  info?: FDBTypes.InitializeParams;

  /** Time at which the developer bridge connection was initialized */
  epoch!: Date;

  /** Milliseconds to wait before giving up on a method call. */
  timeout: number;

  /** Install method to call after an app install has finalized */
  private installHandler?: InstallHandler;

  /** Host information required for intiialization */
  private hostInfo: HostInfo;

  /** Open bulk data transfer streams. */
  protected bulkDataStreams = new BulkData();
  private appInstallStream?: BulkDataStream;

  protected constructor(hostInfo: HostInfo, timeout: number) {
    super();
    this.hostInfo = hostInfo;
    this.timeout = timeout;

    this.capabilities = {
      protocol: {
        maxMessageSize: this.hostInfo.maxMessageSize,
      },
    };

    this.dispatcher
      .method('ping', t.undefined, () => {})
      .method(
        'initialize',
        FDBTypes.InitializeParams,
        this.handleInitialize,
      )
      .method(
        'app.install.stream.begin',
        FDBTypes.AppInstallStreamBeginParams,
        this.handleAppInstallBegin,
      )
      .method(
        'app.install.stream.finalize',
        FDBTypes.StreamCloseParams,
        this.handleAppInstallFinalize,
      )
      .method(
        'app.install.stream.abort',
        FDBTypes.StreamCloseParams,
        this.handleAppInstallAbort,
      );

    this.bulkDataStreams.register(this.dispatcher);
  }

  /**
   * Create a host to listen
   *
   * @param debuggerStream stream for communicating with the debugger
   * @param options connection options
   */
  static create(
    debuggerStream: stream.Duplex,
    hostInfo: HostInfo,
    {
      timeout = 10000,
    } = {},
  ) {

    const host = new this(hostInfo, timeout);
    debuggerStream
      .pipe(new ParseJSON)
      .pipe(host.rpc)
      .pipe(new StringifyJSON)
      .pipe(debuggerStream);

    return host;
  }

  setInstallHandler = (installHandler: InstallHandler, installOptions?: InstallOptions) => {
    this.installHandler = installHandler;
    this.capabilities.io = {
      write: true,
    };
    this.capabilities.appHost = {
      install: {
        ...installOptions,
        sideloadStream: true,
      },
    };
  }

  handleInitialize = (params: FDBTypes.InitializeParams) => {
    this.info = params;
    this.epoch = new Date();

    this.emit('initialized');

    return {
      device: this.hostInfo.device,
      hostKind: this.hostInfo.hostKind,
      capabilities: this.capabilities,
    };
  }

  handleAppInstallBegin = (params: FDBTypes.AppInstallStreamBeginParams)  => {
    const stream = this.bulkDataStreams.createWriteStream();
    if (this.appInstallStream != null) {
      throw new InvalidParams('App install stream is currently being used');
    }

    this.appInstallStream = stream;

    return {
      stream: stream.token,
    };
  }

  validateAppInstallStream(stream: FDBTypes.StreamToken) {
    if (!this.appInstallStream) {
      throw new InvalidParams('No current app install stream exists');
    }

    if (stream !== this.appInstallStream.token) {
      throw new InvalidParams(
        'Stream token does not match the current app install stream',
        { stream },
      );
    }
  }

  handleAppInstallFinalize = async ({ stream }: FDBTypes.StreamCloseParams) => {
    this.validateAppInstallStream(stream);
    if (!this.installHandler) {
      throw new InvalidParams('No install handler has been set');
    }

    const finalizedBuffer = this.appInstallStream!.finalize();
    this.appInstallStream = undefined;

    return this.installHandler(finalizedBuffer);
  }

  handleAppInstallAbort = ({ stream }: FDBTypes.StreamCloseParams) => {
    this.validateAppInstallStream(stream);
    this.appInstallStream!.finalize();
    this.appInstallStream = undefined;
  }

  /**
   * Ping the remote debugger.
   *
   * @param timeout milliseconds to wait for a response
   */
  ping = (timeout = 10000): Promise<void> => this.rpc.callMethod('ping', undefined, { timeout });

  consoleMessage = (args: FDBTypes.ConsoleMessage) =>
    this.rpc.sendNotification('console.message', args)
  consoleTrace = (args: FDBTypes.TraceMessage) =>
    this.rpc.sendNotification('console.traceMessage', args)
}
