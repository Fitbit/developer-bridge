import * as t from 'io-ts';

import { StreamToken } from './BulkData';
import { ComponentBundleKind, UUID } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

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
export type AppComponentContentsList = t.TypeOf<
  typeof AppComponentContentsList
>;

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
export type AppComponentContentsRequest = t.TypeOf<
  typeof AppComponentContentsRequest
>;
