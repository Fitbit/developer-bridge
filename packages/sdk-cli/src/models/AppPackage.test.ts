import jszip from 'jszip';

import AppPackage, { SourceMaps } from './AppPackage';

const manifestCommon = {
  appId: 'eff9d309-eadd-41d7-9af3-696eafc3fa31',
  buildId: '0x0123456789abcdef',
};

const testPackage = {
  buildId: manifestCommon.buildId,
  uuid: manifestCommon.appId,
  components: {
    device: {
      higgs: {
        platform: ['1.2.3+'],
        artifact: Buffer.alloc(0),
      },
    },
    companion: Buffer.alloc(0),
  },
  requestedPermissions: ['access_activity', 'access_location'],
  sdkVersion: {
    deviceApi: '3.0.0',
    companionApi: '2.5.0',
  },
};

const rawSourceMap = {
  version: 3,
  sources: ['app/index.js'],
  names: [],
  mappings: 'someMappings',
  file: 'index.js',
};

describe('fromArtifact', () => {
  const manifestV5 = {
    ...manifestCommon,
    manifestVersion: 5,
    platform: [],
  };

  const manifestV6 = {
    ...manifestCommon,
    manifestVersion: 6,
  };

  type FilesObject = { [path: string]: object | string };

  function buildPackage(files: FilesObject = {}) {
    const zip = new jszip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, typeof content === 'object' ? JSON.stringify(content) : content);
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  function itRejects(name: string, files: FilesObject = {}) {
    it(`rejects ${name}`, async () =>
      expect(AppPackage.fromArtifact(await buildPackage(files)))
        .rejects.toMatchSnapshot());
  }

  function itAccepts(name: string, files: FilesObject) {
    it(`accepts ${name}`, async () =>
      expect(AppPackage.fromArtifact(await buildPackage(files)))
        .resolves.toMatchSnapshot());
  }

  it('rejects a non-zip file', () =>
    expect(AppPackage.fromArtifact('' as any)).rejects.toMatchSnapshot());

  itRejects('a zip file without a manifest');

  itRejects('a manifest that is not JSON', {
    'manifest.json': 'Not JSON',
  });

  itRejects('a manifest with unsupported version', {
    'manifest.json': { manifestVersion: 100 },
  });

  [5, 6].forEach((version) => {
    itRejects(`a v${version} manifest with mistyped components`, {
      'manifest.json': {
        manifestVersion: version,
        components: 'components!',
      },
    });
  });

  itRejects('a v5 manifest with no device component', {
    'manifest.json': {
      ...manifestV5,
      components: { companion: 'companion.zip' },
    },
    'companion.zip': '',
  });

  itRejects('a v5 manifest which references a nonexistent device component file', {
    'manifest.json': {
      ...manifestV5,
      platform: ['HIGGS'],
      components: { watch: 'doesnotexist.zip' },
    },
  });

  itRejects('a v6 manifest which references a nonexistent device component file', {
    'manifest.json': {
      ...manifestV6,
      components: { watch: {
        higgs: { filename: 'doesnotexist.zip' },
      } },
    },
  });

  itRejects('a v5 manifest which references a nonexistent companion component file', {
    'manifest.json': {
      ...manifestV5,
      components: {
        watch: 'device.zip',
        companion: 'companion.zip',
      },
    },
    'device.zip': '',
  });

  itRejects('a v6 manifest which references a nonexistent companion component file', {
    'manifest.json': {
      ...manifestV6,
      components: {
        watch: {
          higgs: { filename: 'higgs.zip' },
        },
        companion: { filename: 'companion.zip' },
      },
    },
    'higgs.zip': '',
  });

  itRejects('a v5 manifest with no platform descriptor', {
    'manifest.json': {
      ...manifestV5,
      platform: undefined,
      components: { watch: 'device.zip' },
    },
    'device.zip': '',
  });

  itAccepts('a v5 manifest with an unversioned platform', {
    'manifest.json': {
      ...manifestV5,
      platform: ['HIGGS'],
      components: { watch: 'device.zip' },
    },
    'device.zip': 'device.zip contents',
  });

  itAccepts('a v5 manifest with a versioned platform', {
    'manifest.json': {
      ...manifestV5,
      platform: ['HIGGS:32.1.16+'],
      components: { watch: 'device.zip' },
    },
    'device.zip': 'device.zip contents',
  });

  itAccepts('a v5 manifest with multiple platforms', {
    'manifest.json': {
      ...manifestV5,
      platform: ['HIGGS:32.1.16+', 'MESON:1.2.3+'],
      components: { watch: 'device.zip' },
    },
    'device.zip': 'device.zip contents',
  });

  itAccepts('a v6 manifest with no platform spec for the device', {
    'manifest.json': {
      ...manifestV6,
      components: {
        watch: {
          higgs: { filename: 'higgs.zip' },
        },
      },
    },
    'higgs.zip': 'higgs.zip contents',
  });

  itAccepts('a v6 manifest with multiple device components', {
    'manifest.json': {
      ...manifestV6,
      components: {
        watch: {
          higgs: {
            platform: ['23.1.5', '32.4.16+'],
            filename: 'higgs.zip',
          },
          meson: {
            platform: ['32.4.17+'],
            filename: 'meson.zip',
          },
        },
      },
    },
    'higgs.zip': 'higgs',
    'meson.zip': 'meson',
  });

  itAccepts('a v5 manifest with a companion', {
    'manifest.json': {
      ...manifestV5,
      platform: ['HIGGS'],
      components: {
        watch: 'device.zip',
        companion: 'companion.zip',
      },
    },
    'device.zip': 'device',
    'companion.zip': 'companion',
  });

  itAccepts('a v6 manifest with a companion', {
    'manifest.json': {
      ...manifestV6,
      components: {
        watch: { higgs: { filename: 'higgs.zip' } },
        companion: { filename: 'companion.zip' },
      },
    },
    'higgs.zip': 'higgs',
    'companion.zip': 'companion',
  });

  itAccepts('a v6 manifest with no device component', {
    'manifest.json': {
      ...manifestV6,
      components: {
        companion: { filename: 'companion.zip' },
      },
    },
    'companion.zip': '',
  });

  it('hydrates a previously-serialized AppPackage instance', async () => {
    const sourcePackage = new AppPackage(testPackage);

    return expect(AppPackage.fromArtifact(await sourcePackage.generateArtifact()))
      .resolves.toMatchObject(sourcePackage);
  });

  describe('when hydrating a previously-serialized source mapped AppPackage', () => {
    async function expectSourceMappedPackageToDeserialize(sourceMaps: SourceMaps) {
      const sourcePackage = new AppPackage({
        ...testPackage,
        sourceMaps,
      });

      return expect(AppPackage.fromArtifact(await sourcePackage.generateArtifact()))
        .resolves.toMatchObject(sourcePackage);
    }

    it('succeeds', () =>
      expectSourceMappedPackageToDeserialize({
        device: {
          higgs: {
            'app/index.js': rawSourceMap,
            'app/test.js': rawSourceMap,
          },
          meson: {
            'app/index.js': rawSourceMap,
          },
        },
        companion: {
          'companion.js': rawSourceMap,
        },
        settings: {
          'settings.js': rawSourceMap,
        },
      }),
    );

    it('succeeds with a component without source map files', () =>
      expectSourceMappedPackageToDeserialize({
        device: {
          higgs: {
            'app/index.js': rawSourceMap,
          },
        },
        companion: {},
      }),
    );

    it('succeeds with a device source map object that has no components', () =>
      expectSourceMappedPackageToDeserialize({ device : {} }));
  });
});

describe('generateArtifact', () => {
  describe('when bundling source map files', () => {
    it('bundles multiple source map files for one component', async () => {
      const sourcePackage = new AppPackage({
        ...testPackage,
        sourceMaps: {
          device: {
            higgs: {
              'app/index.js': rawSourceMap,
              'app/test.js': rawSourceMap,
            },
          },
        },
      });

      const fbaZip = await jszip.loadAsync(await sourcePackage.generateArtifact());
      const manifestJSON = JSON.parse(await fbaZip.file('manifest.json').async('text'));
      const higgsFiles = manifestJSON.sourceMaps.device.higgs;

      await expect(fbaZip.file(higgsFiles['app/index.js']).async('text').then(JSON.parse))
        .resolves.toMatchObject({});

      return expect(fbaZip.file(higgsFiles['app/test.js']).async('text').then(JSON.parse))
        .resolves.toMatchObject({ mappings: 'someMappings' });
    });

    it('bundles companion source map files', async () => {
      const sourcePackage = new AppPackage({
        ...testPackage,
        sourceMaps: {
          device: {
            higgs: {
              'app/index.js': rawSourceMap,
            },
          },
          companion: {
            'companion.js': rawSourceMap,
          },
        },
      });

      const fbaZip = await jszip.loadAsync(await sourcePackage.generateArtifact());
      const manifestJSON = JSON.parse(await fbaZip.file('manifest.json').async('text'));
      const filePath = manifestJSON.sourceMaps.companion['companion.js'];

      return expect(fbaZip.file(filePath).async('text').then(JSON.parse))
        .resolves.toMatchObject({});
    });

    it('bundles settings source map files', async () => {
      const sourcePackage = new AppPackage({
        ...testPackage,
        sourceMaps: {
          device: {
            higgs: {
              'app/index.js': rawSourceMap,
            },
          },
          settings: {
            'settings.js': rawSourceMap,
          },
        },
      });

      const fbaZip = await jszip.loadAsync(await sourcePackage.generateArtifact());
      const manifestJSON = JSON.parse(await fbaZip.file('manifest.json').async('text'));
      const filePath = manifestJSON.sourceMaps.settings['settings.js'];

      return expect(fbaZip.file(filePath).async('text').then(JSON.parse))
        .resolves.toMatchObject({});
    });
  });
});
