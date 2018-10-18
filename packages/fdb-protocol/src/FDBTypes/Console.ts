import * as t from 'io-ts';

import { InstalledAppComponent, Position, Timestamp } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

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
