import { InstallOptions } from '@fitbit/fdb-host';
import jszip from 'jszip';
import lodash from 'lodash';

import { createDebuggerHost, HostDescriptor } from './debuggerHost';

export type HostType = 'app' | 'companion';
interface MockHostProperties {
  maxAPIVersion?: string;
}

function makeInstallCapabilities(
  hostType: HostType,
  hostProperties: MockHostProperties,
): InstallOptions {
  const { maxAPIVersion } = hostProperties;
  const capabilities = {
    app: {
      appBundle: true,
      appCompatibility: [
        {
          maxAPIVersion,
          family: 'Higgs',
          version: '277.255.1.999',
        },
      ],
    },
    companion: {
      companionBundle: true,
      ...(maxAPIVersion && { companionCompatibility: { maxAPIVersion } }),
    },
  };
  return capabilities[hostType];
}

async function getBundleInfo(bundleData: Buffer) {
  const bundleZip = await jszip.loadAsync(bundleData);
  const manifestStr = await bundleZip.file('manifest.json').async('text');
  const manifest = JSON.parse(manifestStr);
  return {
    uuid: manifest.uuid,
    buildID: manifest.buildId.slice(2),
  };
}

export async function createMockHost(
  hostType: 'app' | 'companion',
  hostProperties: MockHostProperties,
  handleLog: (msg: string) => void,
) {
  const hostDescriptor: HostDescriptor = {
    id: `mock_${hostType}`,
    displayName: `Mock ${lodash.startCase(hostType)} Host`,
    capabilities: {
      install: makeInstallCapabilities(hostType, hostProperties),
    },
  };
  const { closePromise, host, close } = await createDebuggerHost(hostDescriptor, handleLog);

  host.setInstallHandler(
    async (bundleData) => {
      const bundleInfo = await getBundleInfo(bundleData);
      handleLog(
        `Sideload received with appID:${bundleInfo.uuid} buildID:${bundleInfo.buildID}`,
      );
      return {
        app: bundleInfo,
        components: [hostType],
      };
    },
    hostDescriptor.capabilities.install,
  );

  return { closePromise, close };
}
