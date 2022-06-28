import * as path from 'path';

import { ComponentSourceMaps } from '@fitbit/app-package';
import * as cbor from 'cbor';
import * as t from 'io-ts';
import { failure } from 'io-ts/lib/PathReporter';
import { pipe } from 'fp-ts/lib/pipeable';
import { fold } from 'fp-ts/lib/Either';
import * as lodash from 'lodash';
import { SourceMapConsumer, RawSourceMap } from 'source-map';

import {
  Edge,
  HeapSnapshot,
  Node,
  NodeTypes,
  RawNode,
  RawEdge,
  V8HeapSnapshot,
  nodeTypeList,
  edgeTypeList,
  SourcePosition,
  nodeTypeMap,
  edgeTypeMap,
  v8NodeTypes,
  GraphNodeAttributes,
  GraphEdgeAttributes,
} from './types';
import assert = require('assert');
import { MultiDirectedGraph } from 'graphology';

type NodeId = number;
type RawNodeMap = Map<NodeId, RawNode>;
type NodeMap = Map<NodeId, Node>;

// Keeps track of all the strings used in the snapshot and deduplicates them for the final dump.
class StringMapper {
  #nextIdx = 0;
  #lookup = new Map<string, number>();

  constructor() {}

  addString(s: string): number {
    if (!this.#lookup.has(s)) {
      this.#lookup.set(s, this.#nextIdx);
      this.#nextIdx += 1;
    }
    return this.#lookup.get(s)!;
  }

  get stringsArray(): string[] {
    // keys() is guaranteed to be in insertion order
    return [...this.#lookup.keys()];
  }
}

// TODO: Deduplicate with sdk-cli
const mapValues = <T, U>(
  obj: { [s: string]: T },
  mapper: (value: T, key: string, index: number) => Promise<U> | U,
) =>
  Promise.all(
    Object.entries(obj).map(async ([key, value], index) => ({
      [key]: await mapper(value, key, index),
    })),
  ).then((entries) => entries.reduce((a, b) => ({ ...a, ...b }), {}));

function validateOrThrow<A, O, I>(type: t.Type<A, O, I>, data: I): A {
  return pipe(
    type.decode(data),
    fold(
      (errors) => {
        throw new Error(failure(errors).join('\n'));
      },
      (validatedData) => validatedData,
    ),
  );
}

function normalizeRawNode(
  { id, type, size, repr }: RawNode,
  rawNodes: RawNodeMap,
): Node {
  if (Array.isArray(repr)) {
    const [source, line, column, name] = repr;
    return {
      id,
      type,
      size,
      position: {
        line,
        column,
        name: name || undefined,
        // TODO: this isn't right, but it was how it behaved before the TS update
        source:
          typeof source === 'string'
            ? source
            : (rawNodes.get(source)!.repr as string),
      },
    };
  }

  if (repr !== null) {
    return { id, type, size, repr };
  }

  return { id, type, size };
}

function normalizeRawEdge(
  { type, to, from, name }: RawEdge,
  nodeNames: Map<NodeId, string>,
): Edge {
  if (typeof name === 'string') {
    return { type, to, from, name };
  }

  if (typeof name === 'number') {
    return {
      type,
      to,
      from,
      name: nodeNames.get(name)!,
    };
  }

  return {
    type,
    to,
    from,
    name: undefined,
  };
}

function flattenEdgesForV8(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  stringMapper: StringMapper,
): number[] {
  const out = new Uint32Array(graph.size * 3);

  const nodeIdToFlatIndex = new Map<string, number>();
  let nodeIdx = 0;
  graph.forEachNode((id) => {
    nodeIdToFlatIndex.set(id, nodeIdx * 7);
    nodeIdx += 1;
  });

  let i = 0;
  graph.forEachNode((id) => {
    let hiddenEdgeIndexInNode = 0;
    graph.forEachOutEdge(id, (_, edge, _2, targetNode) => {
      out[i] = edgeTypeMap.get(edge.type)!;

      // According to
      // https://chromium.googlesource.com/v8/v8.git/+/601223b52a9cb822ed606e1a9bc4e5f552f352c4/src/profiler/heap-snapshot-generator.cc#2693
      // (The chromium heap snapshot generator code), this field is an index number of the edge if
      // the edge type is Hidden or Element (which doesn't exist in JerryScript), so let's do the
      // same and make it a number.  It really isn't clear to me what the index is supposed to be
      // and I'm not sure we can infallably know it given that it doesn't seem to be passed through
      // in the jerryscript-1 data, so lets just make it the ordinal of the other hidden edges in
      // the node it is emitted from.
      if (edge.type === 'hidden' || edge.type === 'element') {
        out[i + 1] = hiddenEdgeIndexInNode + 1;
        hiddenEdgeIndexInNode += 1;
      } else {
        out[i + 1] = stringMapper.addString(edge.name ?? '');
      }
      // This is the index of the starting index of the node in the flattened node list.
      out[i + 2] = nodeIdToFlatIndex.get(targetNode)!;

      i += 3;
    });
  });

  return Array.from(out);
}

function flattenNodesForV8(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  stringMapper: StringMapper,
): number[] {
  const out = new Uint32Array(graph.order * 7); // 7 fields in each output node
  let i = 0;
  graph.forEachNode((id, node) => {
    const edgeCount = graph.outEdges(id).length;

    out[i] = nodeTypeMap.get(node.type)!;
    out[i + 1] = stringMapper.addString(node.name ?? '');
    out[i + 2] = Number.parseInt(id, 10);
    out[i + 3] = node.memory_size ?? 0;
    out[i + 4] = edgeCount;
    out[i + 5] = out[i + 6] = 0;
    i += 7;
  });

  // For some reason, TypedArrays don't serialize to JSON as arrays like you would expect so convert
  // back to regular arrays.
  return Array.from(out);
}

function generateNodeName(
  node: Node,
  nodeIdToSource: Map<NodeId, SourcePosition>,
): string {
  // @ts-ignore
  let name = node.repr || node.position?.name;
  if (nodeIdToSource.has(node.id)) {
    const s = nodeIdToSource.get(node.id)!;
    const pos = `${s.source}:${s.line}`;
    if (name) name += ' - ' + pos;
    else name = pos;
  }

  return name ?? '';
}

async function mapNodeToSource(
  nodes: NodeMap,
  rawSourceMaps: ComponentSourceMaps,
): Promise<Map<number, SourcePosition>> {
  const sourceMapConsumers = await mapValues(
    lodash(rawSourceMaps).pickBy().value() as lodash.Dictionary<RawSourceMap>,
    async (map) => new SourceMapConsumer(map),
  );

  const out = new Map<number, SourcePosition>();
  nodes.forEach((node) => {
    if ('position' in node) {
      const { line, column, source } = node.position;

      const sourceMap = sourceMapConsumers[path.posix.normalize(source)];
      if (!sourceMap) return;

      const mappedPosition = sourceMap.originalPositionFor({
        column,
        line: line + 1,
      });

      if (mappedPosition.source === null) return;

      out.set(node.id, {
        line: mappedPosition.line!,
        column: mappedPosition.column!,
        source: mappedPosition.source,
      });
    }
  });

  return out;
}

export async function generateGraph(
  snapshotBuffer: Buffer,
  version: string,
  rawSourceMaps: ComponentSourceMaps,
): Promise<MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>> {
  if (version !== 'jerryscript-1') {
    throw new Error(`Unknown heap snapshot format "${version}"`);
  }

  const snapshotCBOR = cbor.decodeFirstSync(snapshotBuffer);

  const { meta: jerryMeta, items: packedItems } = validateOrThrow(
    HeapSnapshot,
    snapshotCBOR,
  );

  const rawNodes = new Map<number, RawNode>();
  const rawEdges: RawEdge[] = [];

  let i = 0;
  while (i < packedItems.length) {
    const itemType = jerryMeta.types[packedItems[i]];
    const isNode = NodeTypes.is(itemType);

    // Advance pointer past type field
    i += 1;

    function unpackFields(fieldNames: string[]) {
      const fields: Record<string, any> = {};
      fieldNames.forEach((fieldName) => {
        fields[fieldName] = packedItems[i];
        // Advance pointer past field reference
        i += 1;
      });
      return fields;
    }

    if (isNode) {
      const rawNode = validateOrThrow(RawNode, {
        type: itemType,
        ...unpackFields(jerryMeta.nodeFields),
      });
      rawNodes.set(rawNode.id, rawNode);
    } else {
      rawEdges.push(
        validateOrThrow(RawEdge, {
          type: itemType,
          ...unpackFields(jerryMeta.edgeFields),
        }),
      );
    }
  }

  const nodeMap = new Map<number, Node>();
  for (const [_, rawNode] of rawNodes) {
    nodeMap.set(rawNode.id, normalizeRawNode(rawNode, rawNodes));
  }
  const nodeIdToSource = await mapNodeToSource(nodeMap, rawSourceMaps);

  const nodeNames = new Map<NodeId, string>(
    [...nodeMap.values()].map((n) => [
      n.id,
      generateNodeName(n, nodeIdToSource),
    ]),
  );

  const normalizedEdges = rawEdges.map((rawEdge) =>
    normalizeRawEdge(rawEdge, nodeNames),
  );

  const dcg = new MultiDirectedGraph<
    GraphNodeAttributes,
    GraphEdgeAttributes
  >();
  for (const [id, node] of nodeMap) {
    dcg.addNode(id.toString(), {
      name: nodeNames.get(id)!,
      type: node.type,
      memory_size: node.size,
    });
  }

  for (const e of normalizedEdges) {
    dcg.addEdge(e.from.toString(), e.to.toString(), {
      name: e.name ?? null,
      type: e.type,
    });
  }

  assert(dcg.order === nodeMap.size);
  assert(dcg.size === normalizedEdges.length);

  return dcg;
}

export function generateV8HeapSnapshot(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
): V8HeapSnapshot {
  const stringMapper = new StringMapper();

  const nodeList = flattenNodesForV8(graph, stringMapper);
  const edgesList = flattenEdgesForV8(graph, stringMapper);

  v8SanityChecks(graph, nodeList, edgesList);

  const meta = {
    node_fields: [
      'type',
      'name',
      'id',
      'self_size',
      'edge_count',
      'trace_node_id',
      'detachedness',
    ],
    node_types: [
      nodeTypeList.map((nt) => v8NodeTypes.get(nt)!),
      'string',
      'number',
      'number',
      'number',
      'number',
      'number',
    ] as [typeof nodeTypeList, ...string[]],
    edge_fields: ['type', 'name_or_index', 'to_node'],
    edge_types: [edgeTypeList, 'string_or_number', 'node'] as [
      typeof edgeTypeList,
      ...string[],
    ],
  };

  const snapshot = {
    meta,
    node_count: graph.order,
    edge_count: graph.size,
    trace_function_count: 0 as const,
  };

  return {
    snapshot,
    nodes: nodeList,
    edges: edgesList,
    strings: stringMapper.stringsArray,
  };
}

function v8SanityChecks(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  nodeList: number[],
  edgeList: number[],
) {
  let totalEdgeCounts = 0;
  for (let i = 0; i < nodeList.length; i += 7) {
    totalEdgeCounts += nodeList[i + 4];
  }
  assert(totalEdgeCounts === edgeList.length / 3);

  assert(totalEdgeCounts === graph.size);
  assert(graph.order === nodeList.length / 7);
}
