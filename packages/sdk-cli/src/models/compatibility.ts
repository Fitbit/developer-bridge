import { AppPackage } from '@fitbit/app-package';
import { FDBTypes } from '@fitbit/fdb-protocol';
import { default as ErrorSubclass } from 'error-subclass';
import humanizeList from 'humanize-list';
import lodash from 'lodash';
import semver from 'semver';

class CompatibilityError extends ErrorSubclass {
  static displayName = 'CompatibilityError';
}

class AppCompatibilityError extends CompatibilityError {
  static displayName = 'AppCompatibilityError';
  component = 'app';
}

class CompanionCompatibilityError extends CompatibilityError {
  static displayName = 'CompanionCompatibilityError';
  component = 'companion';
}

function isAPICompatible(
  apiVersion: string,
  compatibilityDescriptor:
    | FDBTypes.AppHostDescriptor
    | FDBTypes.CompanionHostDescriptor,
) {
  if (apiVersion === '*') return true;
  const { maxAPIVersion, exactAPIVersion } = {
    maxAPIVersion: '1.0.0',
    ...compatibilityDescriptor,
  };
  // Note: this isn't quite a caret range, because our spec says the patch version
  // is ignored entirely for the purposes of compatibility, and ~1.2.3 would
  // translate to >=1.2.3 <1.3.0, whereas we want >=1.2.0
  const apiVersionRange = `>=${semver.major(apiVersion)}.${semver.minor(
    apiVersion,
  )}.0`;
  return (
    semver.satisfies(maxAPIVersion, apiVersionRange) ||
    (exactAPIVersion || []).some((v) => semver.eq(v, apiVersion))
  );
}

function getAppHostCompatibilityMatrix(
  hostInfo: FDBTypes.InitializeResult,
): FDBTypes.AppHostDescriptor[] {
  let descriptors: FDBTypes.AppHostDescriptor[] = lodash.get(
    hostInfo,
    'capabilities.appHost.install.appCompatibility',
  );

  if (!descriptors) {
    // Higgs CU2 does not report its compatibility matrix but it does
    // report its version in the 'device' string. Parsing that string
    // to synthesize a compatibility matrix is less than ideal, but
    // we cannot break compatibility with it just yet.
    const parsedDevice = /^(Higgs) (27\.31\.\d+\.\d+)$/.exec(hostInfo.device);
    if (parsedDevice) {
      descriptors = [
        {
          family: parsedDevice[1],
          version: parsedDevice[2],
        },
      ];
    }
  }
  return (descriptors || []).map((descriptor: FDBTypes.AppHostDescriptor) => ({
    ...descriptor,
    family: descriptor.family.toLowerCase(),
  }));
}

export function findCompatibleAppComponent(
  appPackage: AppPackage,
  hostInfo: FDBTypes.InitializeResult,
  platformNameTransformer = (s: string) => s,
) {
  const hostCompatibility = getAppHostCompatibilityMatrix(hostInfo);

  const builtPlatforms = new Set(Object.keys(appPackage.components.device));
  const runtimePlatforms = new Set(
    Object.values(hostCompatibility).map(
      (spec: FDBTypes.AppHostDescriptor) => spec.family,
    ),
  );

  const platformNames = (platforms: Set<string>) =>
    humanizeList([...platforms].map(platformNameTransformer));

  const matchedPlatforms = new Set(
    [...runtimePlatforms].filter((x) => builtPlatforms.has(x)),
  );
  if (matchedPlatforms.size === 0) {
    throw new AppCompatibilityError(
      // tslint:disable-next-line:max-line-length
      `App was built for ${platformNames(
        builtPlatforms,
      )}, but connected device only supports ${platformNames(
        runtimePlatforms,
      )} applications.`,
    );
  }

  for (const hostCompatibilityDescriptor of hostCompatibility) {
    const { family } = hostCompatibilityDescriptor;
    if (!matchedPlatforms.has(family)) continue;
    if (
      !isAPICompatible(
        appPackage.sdkVersion.deviceApi,
        hostCompatibilityDescriptor,
      )
    ) {
      continue;
    }
    return family;
  }

  throw new AppCompatibilityError(
    'Connected device does not support API version requested by app.',
  );
}

function getCompanionHostCompatibilityMatrix(
  hostInfo: FDBTypes.InitializeResult,
): FDBTypes.CompanionHostDescriptor {
  return lodash.get(
    hostInfo,
    'capabilities.appHost.install.companionCompatibility',
  );
}

export function assertCompanionComponentIsCompatible(
  appPackage: AppPackage,
  hostInfo: FDBTypes.InitializeResult,
) {
  const hostCompatibilityDescriptor = getCompanionHostCompatibilityMatrix(
    hostInfo,
  );
  if (
    !isAPICompatible(
      appPackage.sdkVersion.companionApi!,
      hostCompatibilityDescriptor,
    )
  ) {
    throw new CompanionCompatibilityError(
      'Connected phone does not support API version specified requested by companion.',
    );
  }
}
