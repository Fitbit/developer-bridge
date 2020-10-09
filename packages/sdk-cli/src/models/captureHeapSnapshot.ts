import { RemoteHost } from '@fitbit/fdb-debugger';
import fsExtra from 'fs-extra';

export default async function captureHeapSnapshot(
  host: RemoteHost,
  format: string,
  destPath: string,
  uuid?: string,
) {
  if (!host.getHeapSnapshotSupport().supported) {
    throw new Error('Connected device does not support heap snapshots');
  }

  const snapshot = await host.captureHeapSnapshot(format, uuid);
  return fsExtra.writeFile(destPath, snapshot);
}
