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

export const ComponentBundleKind = t.union([
  t.literal('app'),
  t.literal('companion'),
]);
export type ComponentBundleKind = t.TypeOf<typeof ComponentBundleKind>;
