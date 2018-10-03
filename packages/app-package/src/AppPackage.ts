import aprMap from 'apr-map';
import jszip = require('jszip');
import lodash = require('lodash');

/**
 * The source maps are not currently validated, so it would be
 * misleading to claim that it is a valid source map.
 */
type RawSourceMap = unknown;

interface PackageComponents {
  device: {
    [family: string]: {
      artifact: Buffer,
      platform?: string[],
    },
  };
  companion?: Buffer;
}

interface DeviceSourceMaps {
  [family: string]: ComponentSourceMaps;
}

export interface SourceMaps {
  device: DeviceSourceMaps;
  companion?: ComponentSourceMaps;
  settings?: ComponentSourceMaps;
}

export interface ComponentSourceMaps {
  [filename: string]: RawSourceMap;
}

interface BundledComponentSourceMaps {
  [filename: string]: string;
}

interface ManifestSourceMaps {
  device: {
    [family: string]: BundledComponentSourceMaps;
  };
  companion?: BundledComponentSourceMaps;
  settings?: BundledComponentSourceMaps;
}

interface ManifestCommon {
  manifestVersion: number;
  buildId: string;
  appId: string;
  requestedPermissions: string[];
  components: {
    companion?: {};
  };
}

interface ManifestV5 extends ManifestCommon {
  manifestVersion: 5;
  components: {
    watch: string;
    companion?: string;
  };
  platform: string[];
}

interface ManifestV6 extends ManifestCommon {
  manifestVersion: 6;
  sdkVersion: SDKVersion;
  components: {
    watch: {
      [family: string]: {
        platform?: string[];
        filename: string;
      };
    };
    companion?: {
      filename: string;
    };
  };
  sourceMaps?: ManifestSourceMaps;
}

interface SDKVersion {
  deviceApi: string;
  companionApi?: string;
}

function getFile(zip: jszip, path: string) {
  const file = zip.file(path);
  if (!file || file.dir) throw new Error(`${path} not present in zip file`);
  return file;
}

async function getBufferFromZip(zip: jszip, path: string) {
  return getFile(zip, path).async('nodebuffer');
}

async function getTextFromZip(zip: jszip, path: string) {
  return getFile(zip, path).async('text');
}

const extractComponentSourceMaps =
  (sourceMapPaths: BundledComponentSourceMaps, zip: jszip): Promise<ComponentSourceMaps> =>
    aprMap(sourceMapPaths, path => getTextFromZip(zip, path).then(JSON.parse));

async function extractSourceMaps(zip: jszip, sourceMapManifest?: ManifestSourceMaps) {
  if (!sourceMapManifest) return undefined;

  const extractComponent = (component?: BundledComponentSourceMaps) =>
    component && extractComponentSourceMaps(component, zip);

  return {
    device: await aprMap(
      sourceMapManifest.device,
      component => extractComponentSourceMaps(component, zip),
    ) as DeviceSourceMaps,
    companion: await extractComponent(sourceMapManifest.companion),
    settings: await extractComponent(sourceMapManifest.settings),
  };
}

abstract class ManifestParserBase {
  protected manifest!: ManifestCommon;

  abstract getSourceMapExtractor(): (zip: jszip) => Promise<SourceMaps | undefined>;

  pullMetadata() {
    return {
      buildId: this.manifest.buildId,
      uuid: this.manifest.appId,
      requestedPermissions: this.manifest.requestedPermissions,
    };
  }

  getSDKVersions() {
    const versions: SDKVersion = {
      deviceApi: '1.0.0',
    };
    if (this.manifest.components.companion) versions.companionApi = '1.0.0';
    return versions;
  }
}

class ManifestParserV5 extends ManifestParserBase {
  constructor(protected manifest: ManifestV5) {
    super();
  }

  getDeviceComponents() {
    if (typeof this.manifest.components !== 'object' || !this.manifest.components.watch) {
      throw new Error('No components listed in manifest.json');
    }

    if (!Array.isArray(this.manifest.platform)) {
      throw new Error('Missing platform descriptors');
    }

    return this.manifest.platform.map<[string, { filename: string, platform?: string[] }]>(
      (platformDescriptor) => {
        const [, family, platform] = /^([^:]+):?(.+)?$/.exec(platformDescriptor)!;

        return [
          family.toLowerCase(),
          {
            platform: platform ? [platform] : undefined,
            filename: this.manifest.components.watch,
          },
        ];
      },
    );
  }

  getCompanionFilename() {
    return this.manifest.components.companion;
  }

  getSourceMapExtractor() {
    return () => Promise.resolve(undefined);
  }
}

class ManifestParserV6 extends ManifestParserBase {
  constructor(protected manifest: ManifestV6) {
    super();
  }

  getDeviceComponents() {
    if (typeof this.manifest.components !== 'object') {
      throw new Error('No components listed in manifest.json');
    }

    if (!this.manifest.components.watch) return [];

    return Object.entries(this.manifest.components.watch);
  }

  getCompanionFilename() {
    return lodash.get(this.manifest, 'components.companion.filename');
  }

  getSDKVersions() {
    return {
      ...super.getSDKVersions(),
      ...this.manifest.sdkVersion,
    };
  }

  getSourceMapExtractor() {
    return (zip: jszip) => extractSourceMaps(zip, this.manifest.sourceMaps);
  }
}

function getManifestParser(manifest: ManifestCommon) {
  switch (manifest.manifestVersion) {
    case 5:
      return new ManifestParserV5(manifest as ManifestV5);
    case 6:
      return new ManifestParserV6(manifest as ManifestV6);
    default:
      throw new Error(`Unsupported manifest version ${manifest.manifestVersion}`);
  }
}

export interface AppPackage {
  buildId: string;
  components: PackageComponents;
  sourceMaps?: SourceMaps;
  requestedPermissions: string[];
  uuid: string;
  sdkVersion: SDKVersion;
}

export async function fromJSZip(fbaZip: jszip): Promise<AppPackage> {
  const textFile = (path: string) => getTextFromZip(fbaZip, path);
  const bufferFile = (path: string) => getBufferFromZip(fbaZip, path);

  const manifestJSON = JSON.parse(await textFile('manifest.json'));
  const parser = getManifestParser(manifestJSON);

  const device = await Promise.all(
    parser.getDeviceComponents().map(
      ([family, { platform, filename }]) => bufferFile(filename)
        .then(artifact => [family, { platform, artifact }]),
    ),
  ).then(lodash.fromPairs);

  const companionFilename = parser.getCompanionFilename();
  const companion = companionFilename ? await bufferFile(companionFilename) : undefined;

  const sourceMaps = await parser.getSourceMapExtractor()(fbaZip);

  return {
    ...parser.pullMetadata(),
    sourceMaps,
    components: {
      device,
      companion,
    },
    sdkVersion: parser.getSDKVersions(),
  };
}
