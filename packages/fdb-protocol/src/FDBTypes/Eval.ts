import * as t from 'io-ts';
import { DebugCapability } from './AppDebug';
import { UUID } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export const EvalToStringCapability = DebugCapability;
export type EvalToStringCapability = t.TypeOf<typeof EvalToStringCapability>;

export const AppDebugEvalParams = t.intersection(
  [
    t.interface({
      /**
       * The string which the host should evaluate.
       */
      cmd: t.string,
    }),
    t.partial({
      /**
       * The UUID which uniquely identifies the app to execute a REPL commmand for.
       * If not set, the currently foregrounded application is used.
       */
      uuid: UUID,
    }),
  ],
  'AppDebugEvalParams',
);
export type AppDebugEvalParams = t.TypeOf<typeof AppDebugEvalParams>;

export const AppDebugEvalValueResult = t.interface(
  {
    success: t.literal(true),
    value: t.string,
  },
  'AppDebugEvalValueResult',
);
export type AppDebugEvalValueResult = t.TypeOf<typeof AppDebugEvalValueResult>;

export const AppDebugEvalFailureResult = t.interface(
  {
    success: t.literal(false),
  },
  'AppDebugEvalFailureResult',
);
export type AppDebugEvalFailureResult = t.TypeOf<
  typeof AppDebugEvalFailureResult
>;

export const AppDebugEvalResult = t.union(
  [AppDebugEvalValueResult, AppDebugEvalFailureResult],
  'AppDebugEvalResult',
);
export type AppDebugEvalResult = t.TypeOf<typeof AppDebugEvalResult>;
