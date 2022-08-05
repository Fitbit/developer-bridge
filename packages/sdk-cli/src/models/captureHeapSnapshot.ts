import { ComponentSourceMaps } from '@fitbit/app-package';
import { RemoteHost } from '@fitbit/fdb-debugger';
import { generateGraph, generateV8HeapSnapshot } from '@fitbit/memory-profiler';
import fsExtra from 'fs-extra';

export default async function captureHeapSnapshot(
  host: RemoteHost,
  format: string,
  destPath: string,
  uuid?: string,
  sourceMaps?: ComponentSourceMaps,
) {
  let v8Requested = false;
  let actualFormat = format;

  if (format === 'v8') {
    v8Requested = true;
    actualFormat = 'jerryscript-1';
  }

  if (!host.getHeapSnapshotSupport().supported) {
    throw new Error('Connected device does not support heap snapshots');
  }

  const snapshot = await host.captureHeapSnapshot(actualFormat, uuid);
  if (!v8Requested) {
    return fsExtra.writeFile(destPath, snapshot);
  }

  const graph = await generateGraph(snapshot, actualFormat, sourceMaps || {});
  const v8Snapshot = generateV8HeapSnapshot(graph);
  return fsExtra.writeFile(destPath, JSON.stringify(v8Snapshot));
}
