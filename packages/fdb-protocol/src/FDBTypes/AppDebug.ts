import * as t from 'io-ts';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export const DebugCapability = t.intersection(
  [
    t.interface({
      /**
       * If true, the Host supports this debug capability.
       */
      supported: t.boolean,
    }),

    t.partial({
      /**
       * Component must be launched with instrumentation enabled to
       * support this capability.
       *
       * Default false.
       */
      requiresInstrumentedLaunch: t.boolean,
    }),
  ],
  'DebugCapability',
);
export type DebugCapability = t.TypeOf<typeof DebugCapability>;
