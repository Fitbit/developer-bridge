import * as t from 'io-ts';
import isUUID = require('validator/lib/isUUID');
import * as semver from 'semver';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export enum ErrorCodes {
  /** Host received a Request before the initialize Request. */
  HostNotInitialized = -32001,

  /** Message is too long for the recipient to process. */
  MessageTooLong = -32002,

  /**
   * The Server cannot send a success Response to the Client as the
   * Response message would be longer than the maximum message length
   * which the Client has advertised that it can support.
   */
  ResponseTooLong = -32003,

  /** The Server was unable to complete the request. */
  RequestError = -1,
}

export const NonNegativeInteger = t.refinement(
  t.Integer, v => v >= 0, 'NonNegativeInteger');

export const PositiveInteger = t.refinement(
  t.Integer, v => v > 0, 'PositiveInteger');

export class NodeBufferType extends t.Type<Buffer> {
  readonly _tag: 'NodeBufferType' = 'NodeBufferType';
  constructor() {
    super(
      'Buffer',
      (m): m is Buffer => Buffer.isBuffer(m),
      (m, c) => (this.is(m) ? t.success(m) : t.failure(m, c)),
      t.identity,
    );
  }
}
export const NodeBuffer = new NodeBufferType();

export const ObjectURI = t.string;
export type ObjectURI = t.TypeOf<typeof ObjectURI>;

export const AppFileURI = t.refinement(
  ObjectURI, s => s.startsWith('app:///'), 'AppFileURI');
export type AppFileURI = t.TypeOf<typeof AppFileURI>;

/**
 * The time at which an event occurred, specified as a floating-point
 * number of seconds since the debug bridge connection was initialized.
 */
export const Timestamp = t.number;
export type Timestamp = t.TypeOf<typeof Timestamp>;

/** A Semver 2.0.0 version string. */
export const Semver = new t.Type<string>(
  'Semver',
  (value): value is string => t.string.is(value) && semver.valid(value) !== null,
  (value, context) => t.string.validate(value, context).chain((str) => {
    // Round-tripping through semver.valid ensures it's canonically formatted.
    const version = semver.valid(str);
    return version === null ? t.failure(str, context) : t.success(version);
  }),
  t.identity,
);
export type Semver = t.TypeOf<typeof Semver>;

/** A Semver 2.0.0 release version string. */
export const ReleaseSemver = t.refinement(
  Semver, s => semver.parse(s)!.prerelease.length === 0, 'ReleaseSemver',
);
export type ReleaseSemver = t.TypeOf<typeof ReleaseSemver>;

/**
 * A position in a text file, expressed as a zero-based line and
 * character offset. A position is between two characters, like an
 * 'insert' cursor in an editor.
 */
export const Position = t.intersection(
  [
    t.interface({
      /**
       * Path to a text file in an app component.
       */
      source: AppFileURI,

      /**
       * Line position in the source file (zero-based).
       */
      line: NonNegativeInteger,

      /**
       * Character offset on a line in the source file (zero-based).
       */
      column: NonNegativeInteger,
    }),
    t.partial({
      /**
       * When true, the position is in a generated source, which the Host
       * has produced from an original source file that was installed as
       * part of an app component. The Debugger would need to map this
       * position back to the original source using a source map provided
       * by the Host (if the Host has made the source map available to
       * the Debugger).
       */
      generated: t.boolean,

      /**
       * Identifier at the position, if known.
       */
      name: t.string,
    }),
  ],
  'Position',
);
export type Position = t.TypeOf<typeof Position>;

export const UUID = t.refinement(t.string, s => isUUID(s), 'UUID');
export type UUID = t.TypeOf<typeof UUID>;

/**
 * The build ID of a Fitbit app. The build ID is a 64-bit number, which
 * cannot be prepresented with full precision by a JSON number. It is
 * transmitted over the wire by serializing it to a string of sixteen
 * hexadecimal digits.
 */
export const BuildID = t.refinement(
  t.string, s => /^[0-9a-fA-F]{16}$/.test(s), 'BuildID');
export type BuildID = t.TypeOf<typeof BuildID>;

/** A reference to a Fitbit app. */
export const App = t.interface(
  {
    /**
     * The UUID which uniquely identifies the app.
     */
    uuid: UUID,

    /**
     * The build identifier of the app.
     */
    buildID: BuildID,
  },
  'App',
);
export type App = t.TypeOf<typeof App>;

export const Component = t.union(
  [t.literal('app'), t.literal('companion'), t.literal('settings')],
  'Component',
);
export type Component = t.TypeOf<typeof Component>;

/** A component of a Fitbit app. */
export const AppComponent = t.intersection(
  [App, t.interface({ component: Component })],
  'AppComponent',
);
export type AppComponent = t.TypeOf<typeof AppComponent>;

export const DeviceHost = t.partial(
  {
    /**
     * The unique identifier of the Host which the app is installed on.
     *
     * When this field is not present, its value defaults to the
     * identifier of the Host which sent the message.
     */
    hostID: t.string,
  },
  'DeviceHost',
);
export type DeviceHost = t.TypeOf<typeof DeviceHost>;

export const InstalledApp = t.union([App, DeviceHost], 'InstalledApp');
export type InstalledApp = t.TypeOf<typeof InstalledApp>;

export const InstalledAppComponent = t.union(
  [AppComponent, DeviceHost],
  'InstalledAppComponent',
);
export type InstalledAppComponent = t.TypeOf<typeof InstalledAppComponent>;

export const AdditionalSerializationCodec = t.union([
  t.literal('cbor-definite'),
]);
export type AdditionalSerializationType = t.TypeOf<typeof AdditionalSerializationCodec>;

export const SerializationType = t.union([
  AdditionalSerializationCodec,
  t.literal('json'),
]);
export type SerializationType = t.TypeOf<typeof SerializationType>;

/**
 * Extensions to the base protocol which either Endpoint may support.
 */
export const ProtocolCapabilities = t.partial(
  {
    /**
     * The Endpoint supports receiving Batch Request objects as
     * defined in JSON-RPC 2.0.
     */
    batchRequest: t.boolean,

    /**
     * The Endpoint supports receiving messages larger than the size
     * limit required by the protocol. This capability may only
     * increase the limit; a request or response is invalid if it
     * specifies a limit smaller than the protocol requirement.
     * The value MUST be a positive integer.
     */
    maxMessageSize: PositiveInteger,

    /**
     * Other object serialization schemes which this endpoint is capable
     * of receiving in addition to JSON.
     */
    additionalSerializations: t.array(AdditionalSerializationCodec),
  },
  'ProtocolCapabilities',
);
export type ProtocolCapabilities = t.TypeOf<typeof ProtocolCapabilities>;

/**
 * Bulk data transfer capabilities which either Endpoint may support.
 */
export const IOCapabilities = t.partial(
  {
    /**
     * The Endpoint supports having data written to an open stream by
     * supporting the 'io.write' notification.
     */
    write: t.boolean,

    /**
     * Additional transfer encodings which are supported for data transfer
     * Requests to, and Responses from, this Endpoint.
     */
    additionalEncodings: t.array(t.string),
  },
  'IOCapabilities',
);
export type IOCapabilities = t.TypeOf<typeof IOCapabilities>;

/**
 * Console-specific Debugger capabilities.
 */
export const ConsoleDebuggerCapabilities = t.partial(
  {
    /**
     * The Debugger supports receiving messages from app components by
     * supporting the requests 'console.message' and
     * 'console.traceMessage'.
     */
    appLogging: t.boolean,
  },
  'ConsoleDebuggerCapabilities',
);
export type ConsoleDebuggerCapabilities =
  t.TypeOf<typeof ConsoleDebuggerCapabilities>;

/**
 * The capabilities for which Request methods and other features that
 * the Debugger supports.
 */
export const DebuggerCapabilities = t.partial(
  {
    /**
     * Extensions to the base protocol which the Debugger supports.
     */
    protocol: ProtocolCapabilities,

    /**
     * Bulk data transfer capabilities which the Debugger supports.
     */
    io: IOCapabilities,

    /**
     * Console-specific Debugger capabilities.
     */
    console: ConsoleDebuggerCapabilities,

    /**
     * Experimental Debugger capabilities.
     */
    experimental: t.any,
  },
  'DebuggerCapabilities',
);
export type DebuggerCapabilities = t.TypeOf<typeof DebuggerCapabilities>;

/**
 * Params of the initialize request sent from the Debugger to the Host
 * after establishing the connection.
 */
export const InitializeParams = t.intersection(
  [
    t.interface({
      /**
       * The capabilities provided by the Debugger.
       */
      capabilities: DebuggerCapabilities,
    }),
    t.partial({
      /**
       * A human-readable string identifying the Debugger.
       */
      userAgent: t.string,
    }),
  ],
  'InitializeParams',
);
export type InitializeParams = t.TypeOf<typeof InitializeParams>;

export const APICompatibilityDescriptor = t.intersection(
  [
    t.interface({
      /**
       * Maximum compatible API version for the component.
       *
       * This field signifies that the Host supports components which
       * require a release API version less than or equal to the given
       * version using the semver 2.0.0 precedence rules.
       *
       * This string MUST follow the format of a semver version number.
       */
      maxAPIVersion: ReleaseSemver,
    }),

    t.partial({
      /**
       * Exact API version compatibility for the component.
       *
       * This field signifies that the Host is also compatible with
       * components which require one of the listed API versions. The
       * Host is considered to satisfy the app's API version requirement
       * if the component's API version requirement is equal to one of
       * the listed API versions, using the semver 2.0.0 precedence rules.
       *
       * Prerelease API versions are permitted, and can satisfy a
       * component bundle's requirement for prerelease API version.
       *
       * This string MUST follow the format of a semver version number.
       */
      exactAPIVersion: t.array(Semver),
    }),
  ],
  'APICompatibilityDescriptor',
);
export type APICompatibilityDescriptor = t.TypeOf<typeof APICompatibilityDescriptor>;

export const AppHostDescriptor = t.intersection(
  [
    // Partial<APICompatibilityDescriptor>
    // io-ts does not support t.partial(SomeInterface), unfortunately.
    t.partial({
      maxAPIVersion: ReleaseSemver,
      exactAPIVersion: t.array(Semver),
    }),

    t.interface({
      /**
       * Host family name (product codename).
       */
      family: t.string,

      /**
       * Host software version, excluding the product ID part.
       *
       * This string SHOULD follow the format of a semver version number.
       * The semantics of semver are not assumed.
       */
      version: t.string,
    }),
  ],
  'AppHostDescriptor',
);
export type AppHostDescriptor = t.TypeOf<typeof AppHostDescriptor>;

export const CompanionHostDescriptor = APICompatibilityDescriptor;
export type CompanionHostDescriptor = APICompatibilityDescriptor;

/**
 * App Host-specific capabilities.
 */
export const ApplicationHostCapabilities = t.partial(
  {
    /**
     * Capabilities specific to installation of app components.
     */
    install: t.partial({
      /**
       * The Host supports sideloading components in-band with bulk data
       * transfer by supporting the requests
       * 'app.install.stream.begin', 'app.install.stream.finalize' and
       * 'app.install.stream.abort'. The Host MUST advertise support
       * for the 'io.write' capability if it supports this capability.
       */
      sideloadStream: t.boolean,

      /**
       * The Host supports installation of the device app component
       * bundle.
       */
      appBundle: t.boolean,

      /**
       * The Host supports installation of the app companion component
       * bundle (companion and settings components).
       */
      companionBundle: t.boolean,

      /**
       * The compatibility matrix for apps which this Host supports.
       *
       * Each entry in this list is a declaration that the Host is
       * capable of installing and running any device component which
       * itself declares that it is compatible with a platform
       * matching that description.
       *
       * The list MUST be sorted in order of preference with most
       * preferred first. In the case where an app package contains
       * more than one device component that is compatible with this
       * Host, the Debugger SHOULD install the component which is
       * compatible with the most preferred entry in the list.
       */
      appCompatibility: t.array(AppHostDescriptor),

      /**
       * The compatibility descriptor for companions which this Host
       * supports.
       *
       * This is a declaration that the Host is capable of installing
       * and running any companion component whose requirements are
       * satisfied by the given compatibility descriptor.
       */
      companionCompatibility: CompanionHostDescriptor,

      /**
       * This Host supports upgrading installed components via partial
       * bundles.
       */
      partialBundle: t.boolean,
    }),

    /**
     * Capabilities specific to launching of installed apps.
     */
    launch: t.partial({
      /**
       * The Host supports launching of the device app component with
       * the 'app.launchComponent' request.
       */
      appComponent: t.partial({
        canLaunch: t.boolean,
      }),
    }),

    /**
     * Capabilities specific to the capture of app screenshots.
     */
    screenshot: t.intersection([
      t.partial({
        /**
         * The Host supports capturing screenshots and transferring them
         * to the Debugger in-band with bulk data transfer by supporting
         * the 'app.screenshot.stream.capture' request.
         */
        stream: t.boolean,
      }),
      t.interface({
        /**
         * The set of image formats that the Host supports for capturing
         * screenshots.
         */
        imageFormats: t.array(t.string),
      }),
    ]),
  },
  'ApplicationHostCapabilities',
);
export type ApplicationHostCapabilities =
  t.TypeOf<typeof ApplicationHostCapabilities>;

export const HostCapabilities = t.partial(
  {
    /**
     * Extensions to the base protocol which the Host supports.
     */
    protocol: ProtocolCapabilities,

    /**
     * Bulk data transfer capabilities which the Host supports.
     */
    io: IOCapabilities,

    /**
     * App Host-specific capabilities.
     */
    appHost: ApplicationHostCapabilities,

    /**
     * Experimental Host capabilities.
     */
    experimental: t.any,
  },
  'HostCapabilities',
);
export type HostCapabilities = t.TypeOf<typeof HostCapabilities>;

/**
 * What kind of device the Host is.
 */
export const HostKind = t.union([
  t.literal('device'),
  t.literal('companion'),
]);
export type HostKind = t.TypeOf<typeof HostKind>;

/**
 * The Host's response to the Debugger's initialize request.
 */
export const InitializeResult = t.intersection(
  [
    t.interface({
      /**
       * Human-readable name/description of the Host.
       */
      device: t.string,

      /**
       * What kind of device the Host is.
       */
      hostKind: HostKind,

      /**
       * The capabilities which the Host provides.
       */
      capabilities: HostCapabilities,
    }),

    t.partial({
      /**
       * A string which uniquely identifies the Host. This string MUST
       * match the identifier by which other Hosts will reference this
       * Host in their Developer Bridge messages (e.g. the DeviceHost
       * interface).
       *
       * When this field is not present, it defaults to the Host
       * identifier value communicated out-of-band by the Host discovery
       * mechanism. This field is MANDATORY if the Host connection was not
       * established using a discovery mechanism that communicates a Host
       * identifier value.
       */
      hostID: t.string,
    }),
  ],
  'InitializeResult',
);
export type InitializeResult = t.TypeOf<typeof InitializeResult>;

export const ConsoleMessageKind = t.union([
  t.literal('log'),
  t.literal('info'),
  t.literal('warn'),
  t.literal('error'),
]);
export type ConsoleMessageKind = t.TypeOf<typeof ConsoleMessageKind>;

/**
 * The message notification is sent from a Host to a Debugger to inform
 * the Debugger that an app component or the host environment for a
 * component has emitted a message.
 */
export const ConsoleMessage = t.intersection(
  [
    t.partial({
      /**
       * Timestamp of when the log message was emitted by the app
       * component.
       */
      timestamp: Timestamp,

      /**
       * Source position where the message was emitted.
       */
      position: Position,

      /**
       * Message is emitted by the component's host environment, not the
       * app component itself, if true. Defaults to false if not present.
       */
      fromHost: t.boolean,
    }),
    t.interface({
      /**
       * App and component which emitted the message.
       */
      emittedBy: InstalledAppComponent,

      /**
       * Message kind.
       */
      kind: ConsoleMessageKind,

      /**
       * The message contents. The Debugger SHOULD support formatting the
       * `message` array as per the WHATWG Console API spec, or a
       * reasonable approximation of it.
       */
      message: t.array(t.any),
    }),
  ],
  'ConsoleMessage',
);
export type ConsoleMessage = t.TypeOf<typeof ConsoleMessage>;

export const TraceMessageKind = t.union([
  t.literal('trace'),
  t.literal('assert'),
  t.literal('exception'),
]);
export type TraceMessageKind = t.TypeOf<typeof TraceMessageKind>;

/**
 * The TraceMessage notification is sent from a Host to a Debugger to
 * inform the Debugger that an app component has encountered an uncaught
 * exception, faled an assertion or has otherwise emitted a message for
 * which a stack trace should be shown to the user.
 */
export const TraceMessage = t.intersection(
  [
    t.interface({
      /**
       * App and component which emitted the message.
       */
      emittedBy: InstalledAppComponent,

      /**
       * Call stack, innermost frame first.
       */
      stack: t.array(Position),

      /**
       * The reason this message was emitted.
       */
      kind: TraceMessageKind,

      /**
       * The log message contents. The Debugger SHOULD support
       * formatting the `message` array as per the WHATWG Console API
       * spec, or a reasonable approximation of it.
       */
      message: t.array(t.any),
    }),
    t.partial({
      /**
       * Timestamp of when the trace message was emitted by the app
       * component.
       */
      timestamp: Timestamp,
    }),
  ],
  'TraceMessage',
);
export type TraceMessage = t.TypeOf<typeof TraceMessage>;

/**
 * A reference to an open IO stream. Numeric tokens SHOULD NOT contain
 * fractional parts.
 */
export const StreamToken = t.union([t.Integer, t.string], 'StreamToken');
export type StreamToken = t.TypeOf<typeof StreamToken>;

/**
 * A result type for responses to requests which open a stream.
 */
export const StreamOpenResponse = t.interface(
  {
    /**
     * The token for the newly-opened stream.
     */
    stream: StreamToken,
  },
  'StreamOpenResponse',
);
export type StreamOpenResponse = t.TypeOf<typeof StreamOpenResponse>;

/**
 * A type for params of requests which close a stream.
 */
export const StreamCloseParams = t.interface(
  {
    /**
     * The token for the stream to close.
     */
    stream: StreamToken,
  },
  'StreamCloseParams',
);
export type StreamCloseParams = t.TypeOf<typeof StreamCloseParams>;

export const IOEncoding = t.union([
  t.literal('base64'),
  t.literal('none'),
]);
export type IOEncoding = t.TypeOf<typeof IOEncoding>;

export const IOWriteParams = t.intersection(
  [
    t.interface({
      /**
       * Token identifying the stream to apply the write to.
       */
      stream: StreamToken,

      /**
       * Data to write to the stream.
       */
      data: t.union([
        t.string,
        NodeBuffer,
      ]),
    }),
    t.partial({
      /**
       * Transfer encoding which has been applied to the data parameter.
       * Defaults to 'base64'.
       */
      encoding: IOEncoding,
    }),
  ],
  'IOWriteParams',
);
export type IOWriteParams = t.TypeOf<typeof IOWriteParams>;

export const ComponentBundleKind = t.union([
  t.literal('app'),
  t.literal('companion'),
]);
export type ComponentBundleKind = t.TypeOf<typeof ComponentBundleKind>;

export const AppInstallStreamBeginParams = t.interface(
  {
    /**
     * Component bundle to install.
     */
    componentBundle: ComponentBundleKind,
  },
  'AppInstallStreamBeginParams',
);
export type AppInstallStreamBeginParams =
  t.TypeOf<typeof AppInstallStreamBeginParams>;

export const InstallType = t.keyof(
  {
    full: null,
    partial: null,
  },
  'InstallType',
);

export type InstallType = t.TypeOf<typeof InstallType>;

export const AppInstallResult = t.intersection(
  [
    t.interface({
      /**
       * Application which was sideloaded and installed.
       */
      app: App,

      /**
       * Set of components which were installed from the bundle.
       */
      components: t.array(Component),
    }),
    t.partial({
      installType: InstallType,
    }),
  ],
  'AppInstallResult',
);
export type AppInstallResult = t.TypeOf<typeof AppInstallResult>;

export const LaunchComponentParams = t.interface(
  {
    /**
     * UUID of the app to launch.
     */
    uuid: UUID,

    /**
     * Component of the app to launch.
     */
    component: Component,
  },
  'LaunchComponentParams',
);
export type LaunchComponentParams = t.TypeOf<typeof LaunchComponentParams>;

export const AppScreenshotStreamCaptureParams = t.interface(
  {
    /**
     * The token for the stream on the Debugger that the Host should
     * write the captured screenshot to.
     */
    stream: StreamToken,

    /**
     * The image format to encode the captured screenshot.
     */
    imageFormat: t.string,
  },
  'AppScreenshotStreamCaptureParams',
);
export type AppScreenshotStreamCaptureParams =
   t.TypeOf<typeof AppScreenshotStreamCaptureParams>;

export const AppScreenshotStreamCaptureResult = t.partial(
  {
    /**
     * The total size of the image, in bytes, before transfer encoding.
     */
    length: NonNegativeInteger,
  },
  'AppScreenshotStreamCaptureResult',
);
export type AppScreenshotStreamCaptureResult =
  t.TypeOf<typeof AppScreenshotStreamCaptureResult>;

export const AppDebugEvalParams = t.interface(
  {
    /**
     * The string which the host should evaluate.
     */
    cmd: t.string,
  },
  'AppDebugEvalParams',
);
export type AppDebugEvalParams =
   t.TypeOf<typeof AppDebugEvalParams>;

export const AppDebugEvalValueResult = t.interface(
  {
    success: t.literal(true),
    value: t.string,
  },
  'AppDebugEvalValueResult',
);
export type AppDebugEvalValueResult =
    t.TypeOf<typeof AppDebugEvalValueResult>;

export const AppDebugEvalFailureResult = t.interface(
  {
    success: t.literal(false),
  },
  'AppDebugEvalFailureResult',
);
export type AppDebugEvalFailureResult =
    t.TypeOf<typeof AppDebugEvalFailureResult>;

export const AppDebugEvalResult = t.union(
  [
    AppDebugEvalValueResult,
    AppDebugEvalFailureResult,
  ],
  'AppDebugEvalResult',
);
export type AppDebugEvalResult =
    t.TypeOf<typeof AppDebugEvalResult>;

export const ProtocolSerializationChangeNotification = t.interface(
  {
    /**
     * Serialization scheme this Endpoint is about to switch to.
     */
    serialization: SerializationType,
  },
  'ProtocolSerializationChangeNotification',
);
export type ProtocolSerializationChangeNotification =
    t.TypeOf<typeof ProtocolSerializationChangeNotification>;

export const AppComponentContentsList = t.interface(
  {
    /**
     * A map of all the files present in the app component at hand.
     *
     * The key is the path of the file, relative to the component bundle
     * root.
     */
    files: t.dictionary(
      t.string,
      t.type(
        {
          /** The SHA-256 hash of the file's contents, encoded in base64. */
          sha256: t.string,
        },
        'FileDescriptor',
      ),
      'files',
    ),
  },
  'AppComponentContentsList',
);
export type AppComponentContentsList = t.TypeOf<typeof AppComponentContentsList>;

export const AppComponentContentsRequest = t.interface(
  {
    /**
     * Which app to query, based on UUID.
     */
    uuid: UUID,

    /**
     * Which component of the specified app to retrieve the list of
     * contents from.
     */
    componentBundle: ComponentBundleKind,

    /**
     * The Stream that the Host will write the content list to.
     */
    stream: StreamToken,
  },
  'AppComponentContentsRequest',
);
export type AppComponentContentsRequest = t.TypeOf<typeof AppComponentContentsRequest>;
