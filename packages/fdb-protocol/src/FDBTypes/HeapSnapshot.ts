import * as t from 'io-ts';

import { DebugCapability } from './AppDebug';
import { StreamToken } from './BulkData';
import { UUID } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * If supported, a debugger may request heap snapshots for the component.
 */
export const HeapSnapshotCapability = t.intersection(
  [
    DebugCapability,
    t.partial({
      /**
       * List of supported heap snapshot formats.
       * Defaults to an empty array.
       */
      formats: t.array(t.string),
    }),
  ],
  'HeapSnapshotCapability',
);
export type HeapSnapshotCapability = t.TypeOf<typeof HeapSnapshotCapability>;

/**
 * Sent by the host to request a heap snapshot.
 *
 * The app must be a sideloaded javascript app and, if indicated during
 * initialization, must have been launched with debug instrumentation.
 */
export const AppHeapSnapshotRequest = t.intersection(
  [
    t.interface({
      /**
       * The format to receive the snapshot in.
       *
       * One of heapSnapshotFormats declared by the Host during initialization.
       */
      format: t.string,

      /**
       * The Stream that the Host will write the snapshot to.
       */
      stream: StreamToken,
    }),
    t.partial({
      /**
       * The UUID which uniquely identifies the app to take a snapshot of.
       * If not set, the currently foregrounded application is used.
       */
      uuid: UUID,
    }),
  ],
  'AppHeapSnapshotRequest',
);
export type AppHeapSnapshotRequest = t.TypeOf<typeof AppHeapSnapshotRequest>;
