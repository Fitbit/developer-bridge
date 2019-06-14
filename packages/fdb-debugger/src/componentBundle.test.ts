import crypto = require('crypto');

import JSZip = require('jszip');
import { getAppUUID, makePartialBundle } from '@fitbit/fdb-debugger/src/componentBundle';

describe('getAppUUID', () => {
  it('loads the app UUID from the component zip file', () => {
    const uuid = 'this-is-the-uuid';
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ uuid }));
    return expect(getAppUUID(zip)).resolves.toBe(uuid);
  });

  it('rejects an empty zip file', () =>
    expect(getAppUUID(new JSZip())).rejects.toThrow(
      'Not a valid component bundle: manifest.json not present',
    ));

  it('rejects a malformed manifest.json', () => {
    const zip = new JSZip();
    zip.file('manifest.json', '}');
    return expect(getAppUUID(zip)).rejects.toThrowError(SyntaxError);
  });

  it.each<[string, { uuid?: string[] | null }]>([
    ['missing uuid field', {}],
    ['with a null uuid', { uuid: null }],
    ['with "uuid" as an array', { uuid: ['foo'] }],
  ])('rejects a manifest.json %s', (_, manifest) => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    return expect(getAppUUID(zip)).rejects.toThrow(
      'Not a valid component bundle: "uuid" field in manifest.json is missing or not a string',
    );
  });
});

function sha256(data: string | Buffer) {
  const hash = crypto.createHash('sha256');
  return { sha256: hash.update(data).digest('hex') };
}

function sha256U(data: string | Buffer) {
  return { sha256: sha256(data).sha256.toUpperCase() };
}

describe('makePartialBundle', () => {
  it('refuses to operate on a partial bundle', () => {
    const zip = new JSZip();
    zip.file('.partial.json', '');
    return expect(makePartialBundle(zip, { files: {} })).rejects.toThrow(
      'Component bundle already contains .partial.json',
    );
  });

  it('keeps manifest.json even if it is identical', async () => {
    const zip = new JSZip();
    const manifest = '{}';
    zip.file('manifest.json', manifest);
    zip.file('foo.js', '');
    zip.file('bar.js', 'a');
    const partial = await makePartialBundle(zip, {
      files: {
        'manifest.json': sha256(manifest),
        'foo.js': sha256(''),
      },
    });
    expect(partial).not.toBeNull();
    if (partial) {
      const partialZip = await JSZip.loadAsync(partial);
      expect(partialZip.file('manifest.json')).not.toBeNull();
      const partialManifest = JSON.parse(await partialZip.file('.partial.json').async('text'));
      expect(partialManifest.delete).not.toContain('manifest.json');
    }
  });

  it('detects when the partial install would be a no-op', async () => {
    const files = {
      'manifest.json': '{}',
      'app.js': 'console.log("hello")',
      'resources/index.gui': '<svg></svg>',
    };

    const existingFileList = {
      files:
        Object.entries(files)
          .map(([path, contents]) => ({ [path]: sha256(contents) }))
          .reduce((a, b) => Object.assign(a, b)),
    };

    const zip = new JSZip();
    zip.folder('folder');
    Object.entries(files).forEach(([path, contents]) => zip.file(path, contents));
    return expect(makePartialBundle(zip, existingFileList)).resolves.toBeNull();
  });

  it('detects when no files could be reused by a partial install', () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    zip.file('new.js', 'foo');
    zip.file('updated.js', 'bar');
    zip.folder('folder');

    const existingFileList = {
      files: {
        'manifest.json': sha256('asdf'),
        'updated.js': sha256('old contents'),
        'prune.js': sha256('blah'),
      },
    };

    return expect(makePartialBundle(zip, existingFileList)).rejects.toThrow(
      'No files can be reused for partial app install',
    );
  });

  describe('when making a partial bundle', () => {
    const filesOnDevice = {
      'manifest.json': 'manifest on device',
      'prune.js': 'this file is not in the zip',
      'updated.js': 'old version',
      'same.js': 'same',
      'resources/index.gui': '<svg></svg>',
      'resources/widgets.gui': '<svg><defs></defs></svg>',
      'resources/prune.txt': 'resource going away',
    };

    const filesInZip = {
      'manifest.json': 'manifest in zip',
      'new.js': 'new file',
      'updated.js': 'new version',
      'same.js': 'same',
      'resources/index.gui': '<svg><g></g></svg>',
      'resources/widgets.gui': '<svg><defs></defs></svg>',
      'resources/new-resource.txt': 'resource coming in',
    };

    let partialZip: JSZip;
    let partialManifest: { delete: string[] };

    beforeAll(async () => {
      const existingFileList = {
        files:
          Object.entries(filesOnDevice)
            .map(([path, contents]) => ({ [path]: sha256U(contents) }))
            .reduce((a, b) => Object.assign(a, b)),
      };

      const zip = new JSZip();
      Object.entries(filesInZip).forEach(([path, contents]) => zip.file(path, contents));
      zip.folder('emptyfolder');

      const partialBinary = await makePartialBundle(zip, existingFileList);
      expect(partialBinary).not.toBeNull();
      if (partialBinary) {
        partialZip = await JSZip.loadAsync(partialBinary);
        partialManifest = JSON.parse(await partialZip.file('.partial.json').async('text'));
      }
    });

    it('ignores folders in the zip bundle', () => {
      expect(partialManifest.delete).not.toContainEqual(expect.stringContaining('emptyfolder'));
    });

    it('keeps only files that differ in the partial bundle', () => {
      const files: string[] = [];
      partialZip.forEach((path, file) => { if (!file.dir) files.push(path); });
      expect(files.sort()).toEqual([
        'manifest.json',
        '.partial.json',
        'new.js',
        'updated.js',
        'resources/index.gui',
        'resources/new-resource.txt',
      ].sort());
    });

    it('lists all the files that should be deleted from the device', () => {
      expect(partialManifest.delete.sort()).toEqual([
        'prune.js', 'resources/prune.txt',
      ].sort());
    });
  });
});
