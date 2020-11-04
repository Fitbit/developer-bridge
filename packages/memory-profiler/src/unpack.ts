import * as path from 'path';

import { ComponentSourceMaps } from '@fitbit/app-package';
import * as cbor from 'cbor';
import * as t from 'io-ts';
import { failure } from 'io-ts/lib/PathReporter';
import { pipe } from 'fp-ts/lib/pipeable';
import { fold } from 'fp-ts/lib/Either';
import * as lodash from 'lodash';
import { SourceMapConsumer, RawSourceMap } from 'source-map';

import { Edge, HeapSnapshot, Node, NodeTypes, RawNode, RawEdge } from './types';

type RawNodeMap = Record<number, RawNode>;
type NodeMap = Record<number, Node>;

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
            : (rawNodes[source].repr as string),
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
  nodes: NodeMap,
): Edge {
  if (typeof name === 'string') {
    return { type, to, from, name };
  }

  if (typeof name === 'number') {
    const referencedNode = nodes[name];
    if ('repr' in referencedNode) {
      return {
        type,
        to,
        from,
        name: referencedNode.repr,
      };
    }
  }

  return {
    type,
    to,
    from,
    name: undefined,
  };
}

async function applySourceMap(
  nodes: NodeMap,
  rawSourceMaps: ComponentSourceMaps,
) {
  const sourceMapConsumers = await mapValues(
    lodash(rawSourceMaps).pickBy().value() as lodash.Dictionary<RawSourceMap>,
    async (map) => new SourceMapConsumer(map),
  );

  for (const node of Object.values(nodes)) {
    if ('position' in node) {
      const { line, column, source } = node.position;

      const sourceMap = sourceMapConsumers[path.posix.normalize(source)];
      if (!sourceMap) continue;

      const mappedPosition = sourceMap.originalPositionFor({
        column,
        line: line + 1,
      });

      if (mappedPosition.source === null) continue;

      node.position = {
        line: mappedPosition.line - 1,
        column: mappedPosition.column,
        source: mappedPosition.source,
      };
    }
  }
}

export default async function unpack(
  snapshotBuffer: Buffer,
  version: string,
  rawSourceMaps: ComponentSourceMaps,
): Promise<{
  version: 'jerryscript-1';
  nodes: NodeMap;
  edges: Edge[];
}> {
  if (version !== 'jerryscript-1') {
    throw new Error(`Unknown heap snapshot format "${version}"`);
  }

  const snapshotCBOR = cbor.decodeFirstSync(snapshotBuffer);

  const { meta, items: packedItems } = validateOrThrow(
    HeapSnapshot,
    snapshotCBOR,
  );

  const rawNodes: RawNodeMap = {};
  const rawEdges: RawEdge[] = [];

  let i = 0;
  while (i < packedItems.length) {
    const itemType = meta.types[packedItems[i]];
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
        ...unpackFields(meta.nodeFields),
      });
      rawNodes[rawNode.id] = rawNode;
    } else {
      rawEdges.push(
        validateOrThrow(RawEdge, {
          type: itemType,
          ...unpackFields(meta.edgeFields),
        }),
      );
    }
  }

  const nodes: NodeMap = {};
  for (const rawNode of Object.values(rawNodes)) {
    nodes[rawNode.id] = normalizeRawNode(rawNode, rawNodes);
  }

  const edges = rawEdges.map((rawEdge) => normalizeRawEdge(rawEdge, nodes));

  await applySourceMap(nodes, rawSourceMaps);

  return {
    version,
    nodes,
    edges,
  };
}
