import * as t from 'io-ts';

import { FDBTypes } from '@fitbit/fdb-protocol';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export const NodeTypes = t.union([
  t.literal('Hidden'),
  t.literal('Array'),
  t.literal('String'),
  t.literal('Object'),
  t.literal('Code'),
  t.literal('Sourcemap'),
  t.literal('Closure'),
  t.literal('Regexp'),
  t.literal('Heapnumber'),
  t.literal('Native'),
  t.literal('Synthetic'),
  t.literal('Constring'),
  t.literal('Slicedstring'),
  t.literal('Symbol'),
  t.literal('Bigint'),
]);

export const EdgeTypes = t.union([
  t.literal('hidden'),
  t.literal('lexenv'),
  t.literal('prototype'),
  t.literal('bind'),
  t.literal('this'),
  t.literal('bindargs'),
  t.literal('element'),
  t.literal('property'),
  t.literal('propertyname'),
  t.literal('propertyget'),
  t.literal('propertyset'),
  t.literal('promiseresult'),
  t.literal('promisefulfill'),
  t.literal('promisereject'),
  t.literal('scope'),
  t.literal('shortcut'),
  t.literal('weak'),
]);

export const NodeFields = t.union([
  t.literal('id'),
  t.literal('size'),
  t.literal('repr'),
]);

export const EdgeFields = t.union([
  t.literal('from'),
  t.literal('to'),
  t.literal('name'),
]);
export type EdgeFields = t.TypeOf<typeof EdgeFields>;

export const HeapSnapshot = t.interface(
  {
    meta: t.interface({
      /**
       * Array of node and edge types included in this snapshot.
       * Index into this array when decoding an item's type field.
       */
      types: t.array(
        t.union([
          NodeTypes,
          EdgeTypes,
        ]),
      ),

      /**
       * List of node field names, in the order they will appear in the representation.
       * All node items, regardless of their type, will have this same set of fields.
       * The types given here indicate the type of the field as it will appear in the main payload.
       * Some of:
       * * id              (number): unique identifier of node
       * * size       (number|null): size of node, in bytes (not including children)
       * * repr (ReprPosition|null): representation of node (e.g. contents of string, name of
       *                             prototype), can also include source position information.
       */
      nodeFields: t.array(NodeFields),

      /**
       * List of edge field names, in the order they will appear in the representation,
       * similar to nodeFields.
       * Some of:
       * * from (number): id of node that edge originates from
       * * to   (number): id of node that edge points towards
       * * name (number|string): name of edge (e.g. property name, array index) as node ID
       *                         or literal string
       */
      edgeFields: t.array(EdgeFields),
    }),

    /**
     * Stream of heap layout items, as a flat array.
     * Each item (node or edge) is represented by a subsequence of form:
     * [..., type, field1, field2, ..., fieldn, ...]
     * `type` is an index into the meta.types array, while the balance of fields are as
     * specified in meta.nodeFields or meta.edgeFields (as appropriate). Nodes and edges
     * may appear in any order relative to one another. Edges and nodes may be duplicated,
     * but any duplicates must be identical.
     */
    items: t.any,
  },
  'HeapSnapshot',
);
export type HeapSnapshot = t.TypeOf<typeof HeapSnapshot>;

export const RawPosition = t.union([
  t.string, // string representation
  t.tuple([
    t.union([t.number, t.string]), // source path string or string node ID
    t.number, // line
    t.number, // column
    t.union([t.null, t.string]), // string representation
  ]),
  t.null,
]);
export type RawPosition = t.TypeOf<typeof RawPosition>;

export const RawNode = t.interface(
  {
    type: NodeTypes,
    id: t.number,
    size: t.union([t.number, t.null]),
    repr: RawPosition,
  },
  'RawNode',
);
export type RawNode = t.TypeOf<typeof RawNode>;

export const Node = t.intersection(
  [
    t.interface({
      type: NodeTypes,
      id: t.number,
      size: t.union([t.number, t.null]),
    }),
    t.union([
      t.interface({
        position: FDBTypes.Position,
      }),
      t.partial({
        repr: t.string,
      }),
    ]),
  ],
  'Node',
);
export type Node = t.TypeOf<typeof Node>;

export const Edge = t.intersection(
  [
    t.interface({
      type: EdgeTypes,
      to: t.number,
      from: t.number,
    }),
    t.partial({
      name: t.string,
    }),
  ],
  'Edge',
);
export type Edge = t.TypeOf<typeof Edge>;

export const RawEdge = t.interface(
  {
    type: EdgeTypes,
    to: t.number,
    from: t.number,
    name: t.union([t.number, t.string, t.null]),
  },
  'RawEdge',
);
export type RawEdge = t.TypeOf<typeof RawEdge>;
