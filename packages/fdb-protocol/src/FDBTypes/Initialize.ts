import * as t from 'io-ts';

import { AppInstallCapabilities } from './AppInstall';
import { IOCapabilities } from './BulkData';
import { ConsoleDebuggerCapabilities } from './Console';
import { EvalToStringCapability } from './Eval';
import { HeapSnapshotCapability } from './HeapSnapshot';
import { LaunchCapabilities } from './Launch';
import { ProtocolCapabilities } from './Meta';
import { ScreenshotCapabilities } from './Screenshot';
import { Component } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * The capabilities for which Request methods and other features that
 * the Debugger supports.
 */
export const DebuggerCapabilities = t.partial(
  {
    protocol: ProtocolCapabilities,
    io: IOCapabilities,
    console: ConsoleDebuggerCapabilities,
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

/**
 * What kind of device the Host is.
 */
export const HostKind = t.union([
  t.literal('device'),
  t.literal('companion'),
]);
export type HostKind = t.TypeOf<typeof HostKind>;

export const AppDebugCapabilities = t.partial(
  {
    heapSnapshot: HeapSnapshotCapability,
    evalToString: EvalToStringCapability,
  },
  'AppDebugCapabilities',
);
export type AppDebugCapabilities = t.TypeOf<typeof AppDebugCapabilities>;

/**
 * App Host-specific capabilities.
 */
export const ApplicationHostCapabilities = t.partial(
  {
    install: AppInstallCapabilities,
    launch: LaunchCapabilities,
    screenshot: ScreenshotCapabilities,
    debug: t.dictionary(Component, t.union([t.undefined, AppDebugCapabilities])),
  },
  'ApplicationHostCapabilities',
);
export type ApplicationHostCapabilities =
  t.TypeOf<typeof ApplicationHostCapabilities>;

export const HostCapabilities = t.partial(
  {
    protocol: ProtocolCapabilities,
    io: IOCapabilities,
    appHost: ApplicationHostCapabilities,
    experimental: t.any,
  },
  'HostCapabilities',
);
export type HostCapabilities = t.TypeOf<typeof HostCapabilities>;

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
