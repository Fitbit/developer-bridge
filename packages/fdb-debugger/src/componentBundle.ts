import { FDBTypes } from '@fitbit/fdb-protocol';
import JSZip = require('jszip');
import simpleSHA256 = require('simple-sha256');

interface PartialManifest {
  /** Paths to delete during install. */
  delete: string[];
}

export async function getAppUUID(zipFile: JSZip) {
  const manifestFile = zipFile.file('manifest.json');

  if (manifestFile == null) {
    throw new Error('Not a valid component bundle: manifest.json not present');
  }

  const manifest = JSON.parse(await manifestFile.async('text'));
  if (typeof manifest.uuid !== 'string') {
    throw new Error(
      'Not a valid component bundle: "uuid" field in manifest.json is missing or not a string',
    );
  }

  return manifest.uuid;
}

/**
 * Convert a full app component bundle into a partial app install bundle.
 *
 * The component bundle zip object is mutated in the process.
 *
 * The returned Promise resolves to `null` if the component bundle is
 * identical to the contents list. In this case the partial bundle would
 * have been empty and installing it would have been a no-op, so the
 * install can be elided entirely.
 *
 * @param zipFile component bundle zip file
 * @param existing contents list of the currently-installed version of the app
 */
export async function makePartialBundle(
  zipFile: JSZip,
  existing: FDBTypes.AppComponentContentsList,
) {
  if (zipFile.file('.partial.json')) {
    throw new Error('Component bundle already contains .partial.json');
  }

  const deleteList: string[] = [];
  let manifestIsIdentical = false;
  let filesArePruned = false;

  for (const [path, { sha256 }] of Object.entries(existing.files)) {
    const file = zipFile.file(path);

    if (file == null) {
      deleteList.push(path);
    } else {
      const zipdigest = await file.async('uint8array').then(simpleSHA256);
      if (sha256.toLowerCase() === zipdigest.toLowerCase()) {
        if (path === 'manifest.json') {
          // Special case: manifest.json must not be pruned from the
          // component bundle, even if it is totally unchanged from the
          // installed copy, as it is required for the host to know
          // which app to apply the partial bundle to.
          manifestIsIdentical = true;
        } else {
          zipFile.remove(path);
          filesArePruned = true;
        }
      }
    }
  }

  if (
    manifestIsIdentical &&
    deleteList.length === 0 &&
    zipFile.filter((path, file) => path !== 'manifest.json' && !file.dir).length === 0
  ) {
    // There is nothing to install. There are no files to add or remove.
    return null;
  }

  if (!filesArePruned) {
    // None of the already-installed files can be reused for a partial
    // app install. A "partial" bundle would just be the full bundle
    // plus '.partial.json', making the bundle larger than the original
    // full bundle, completely defeating the purpose of partial app
    // installs in the first place.
    throw new Error('No files can be reused for partial app install');
  }

  const partialManifest: PartialManifest = {
    delete: deleteList,
  };

  zipFile.file('.partial.json', JSON.stringify(partialManifest));
  return zipFile.generateAsync({
    type: 'nodebuffer',
    // Support for partial app install implies that compressed zip files
    // are also supported.
    compression: 'DEFLATE',
  });
}
