import jszip from 'jszip';
import lodash from 'lodash';
import { RawSourceMap } from 'source-map';

import mapValues from '../util/mapValues';

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

function packageComponentSourceMaps(files: ComponentSourceMaps, prefix: string, zip: jszip) {
  return lodash.mapValues(files, (sourceMap, file) => {
    const zipFileName = `sourceMaps/${prefix}/${file}.map`;
    zip.file(zipFileName, JSON.stringify(sourceMap));
    return zipFileName;
  });
}

function bundleSourceMaps(zip: jszip, sourceMaps?: SourceMaps) {
  if (!sourceMaps) return;

  const sourceMapObject: ManifestSourceMaps = { device: {} };
  const packageSourceMaps = (files: ComponentSourceMaps, prefix: string) =>
    packageComponentSourceMaps(files, prefix, zip);

  Object.entries(sourceMaps.device).forEach(([family, files]) => {
    sourceMapObject.device[family] = packageSourceMaps(files, `device/${family}`);
  });

  if (sourceMaps.companion) {
    sourceMapObject.companion = packageSourceMaps(sourceMaps.companion, 'companion');
  }

  if (sourceMaps.settings) {
    sourceMapObject.settings = packageSourceMaps(sourceMaps.settings, 'settings');
  }

  return sourceMapObject;
}

const extractComponentSourceMaps =
  (sourceMapPaths: BundledComponentSourceMaps, zip: jszip): Promise<ComponentSourceMaps> =>
    mapValues(sourceMapPaths, path => getTextFromZip(zip, path).then(JSON.parse));

async function extractSourceMaps(zip: jszip, sourceMapManifest?: ManifestSourceMaps) {
  if (!sourceMapManifest) return undefined;

  const extractComponent = (component?: BundledComponentSourceMaps) =>
    component && extractComponentSourceMaps(component, zip);

  return {
    device: await mapValues(
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

export default class AppPackage {
  public buildId: string;
  public components: PackageComponents;
  public sourceMaps?: SourceMaps;
  public requestedPermissions: string[];
  public uuid: string;
  public sdkVersion: SDKVersion;

  /** Used by Studio's sideload view to show the manifest content
   * @deprecated  */
  public manifest?: ManifestV5 | ManifestV6;

  constructor({
    buildId,
    components,
    sourceMaps,
    requestedPermissions,
    uuid,
    sdkVersion,
  }: {
    buildId: string,
    components: PackageComponents,
    sourceMaps?: SourceMaps,
    requestedPermissions: string[],
    uuid: string,
    sdkVersion: SDKVersion,
  }) {
    this.buildId = buildId;
    this.components = components;
    this.sourceMaps = sourceMaps;
    this.requestedPermissions = requestedPermissions;
    this.uuid = uuid;
    this.sdkVersion = sdkVersion;
  }

  generateArtifact() {
    const zip = new jszip();

    const manifest: ManifestV6 = {
      manifestVersion: 6,
      buildId: this.buildId,
      appId: this.uuid,
      requestedPermissions: this.requestedPermissions,
      components: { watch: {} },
      sdkVersion: this.sdkVersion,
      sourceMaps: bundleSourceMaps(zip, this.sourceMaps),
    };

    for (const [family, { platform, artifact }] of Object.entries(this.components.device)) {
      const filename = `device-${family}.zip`;
      manifest.components.watch[family] = { platform, filename };
      zip.file(filename, artifact);
    }

    if (this.components.companion) {
      manifest.components.companion = {
        filename: 'companion.zip',
      };
      zip.file(manifest.components.companion.filename, this.components.companion);
    }

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  static async fromArtifact(artifactData: Buffer) {
    const fbaZip = await jszip.loadAsync(artifactData);
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

    const appPackage = new this({
      ...parser.pullMetadata(),
      sourceMaps,
      components: {
        device,
        companion,
      },
      sdkVersion: parser.getSDKVersions(),
    });

    appPackage.manifest = manifestJSON;

    return appPackage;
  }
}
