import { AppPackage } from '@fitbit/app-package';
import { FDBTypes } from '@fitbit/fdb-protocol';

import { findCompatibleAppComponent, assertCompanionComponentIsCompatible } from './compatibility';

function makeAppPackage(...families: string[]) {
  const appPackage: AppPackage = {
    uuid: '',
    buildId: '',
    requestedPermissions: [],
    components: {
      device: {},
    },
    sdkVersion: {
      deviceApi: '1.0.0',
    },
  };
  families.forEach((name) => {
    appPackage.components.device[name] = {
      artifact: Buffer.alloc(0),
    };
  });
  return appPackage;
}

function makeHost(...families: string[]): FDBTypes.InitializeResult {
  return {
    device: '',
    hostKind: 'device',
    capabilities: { appHost: { install: {
      appCompatibility: families.map(family => ({ family, version: '32.10.10' })),
    } } },
  };
}

function makeCompanionHost(maxAPIVersion = '1.0.0'): FDBTypes.InitializeResult {
  return {
    device: '',
    hostKind: 'companion',
    capabilities: { appHost: { install: {
      companionCompatibility: {
        maxAPIVersion,
      },
    } } },
  };
}

describe('given an app which is only compatible with one family', () => {
  const app = makeAppPackage('higgs');

  it('is compatible with the exact host', () => {
    expect(findCompatibleAppComponent(app, makeHost('Higgs'))).toBe('higgs');
  });

  it('is compatible with a host which is back-compatible to that family', () => {
    expect(findCompatibleAppComponent(app, makeHost('Alpha', 'Higgs')))
      .toBe('higgs');
  });

  it('is compatible with a host that reports a lowercased family name', () => {
    expect(findCompatibleAppComponent(app, makeHost('higgs'))).toBe('higgs');
  });

  it('is incompatible with an incompatible host', () => {
    expect(() => findCompatibleAppComponent(app, makeHost('Beta'))).toThrowErrorMatchingSnapshot();
  });

  it('is incompatible if the device reported API version too low', () => {
    app.sdkVersion.deviceApi = '2.0.0';
    expect(() => findCompatibleAppComponent(app, makeHost('Higgs'))).toThrowErrorMatchingSnapshot();
  });

  it('is compatible when a wildcard version is requested', () => {
    app.sdkVersion.deviceApi = '*';
    expect(findCompatibleAppComponent(app, makeHost('Higgs'))).toBe('higgs');
  });
});

describe('given an app which is compatible with multiple families', () => {
  const app = makeAppPackage('higgs', 'alpha');

  it('picks the most-preferred component for the host', () => {
    expect(findCompatibleAppComponent(app, makeHost('Beta', 'Alpha', 'Higgs')))
      .toBe('alpha');
  });

  it('is incompatible with an incompatible host', () => {
    expect(() => findCompatibleAppComponent(app, makeHost('Beta', 'Delta')))
      .toThrowErrorMatchingSnapshot();
  });

  it('is incompatible with a host with an empty compatibility list', () => {
    expect(() => findCompatibleAppComponent(app, makeHost())).toThrowErrorMatchingSnapshot();
  });

  it('is incompatible with a host which is missing the capability entirely', () => {
    expect(() => findCompatibleAppComponent(app, {} as any)).toThrowErrorMatchingSnapshot();
  });
});

describe('given an app with a companion', () => {
  const app = makeAppPackage('higgs');

  it('is compatible if the phone reported API version more than the requested version', () => {
    app.sdkVersion.companionApi = '1.0.0';
    expect(
      assertCompanionComponentIsCompatible(app, makeCompanionHost('2.0.0')),
    ).toBeUndefined();
  });

  it('is compatible if the phone reported API version is exactly the requested version', () => {
    app.sdkVersion.companionApi = '2.0.0';
    expect(
      assertCompanionComponentIsCompatible(app, makeCompanionHost('2.0.0')),
    ).toBeUndefined();
  });

  it('is compatible if the phone reported API version of a lower patch version only', () => {
    app.sdkVersion.companionApi = '2.0.1';
    expect(
      assertCompanionComponentIsCompatible(app, makeCompanionHost('2.0.0')),
    ).toBeUndefined();
  });

  it('is compatible if the phone reported API version of a higher minor version', () => {
    app.sdkVersion.companionApi = '2.0.1';
    expect(
      assertCompanionComponentIsCompatible(app, makeCompanionHost('2.2.0')),
    ).toBeUndefined();
  });

  it('is incompatible if the phone reported API version too low', () => {
    app.sdkVersion.companionApi = '2.0.0';
    expect(
      () => assertCompanionComponentIsCompatible(app, makeCompanionHost()),
    ).toThrowErrorMatchingSnapshot();
  });

  it('is compatible if no API compat is declared and 1.0.0 is requested', () => {
    app.sdkVersion.companionApi = '1.0.0';
    const host = {
      ...makeCompanionHost(),
      capabilities: { appHost: { install: {} } },
    };
    expect(
      () => assertCompanionComponentIsCompatible(app, host),
    ).not.toThrow();
  });
});

describe('given a Higgs CU2 device', () => {
  const hostInfo = { ...makeHost('higgs'), device: 'Higgs 27.31.1.29', capabilities: {} };

  it('is compatible with Higgs apps', () => {
    expect(findCompatibleAppComponent(makeAppPackage('alpha', 'higgs'), hostInfo))
      .toBe('higgs');
  });

  it('is incompatible with non-Higgs apps', () => {
    expect(() => findCompatibleAppComponent(makeAppPackage('Alpha', 'Beta'), hostInfo))
      .toThrowErrorMatchingSnapshot();
  });

  describe('with a compatibility matrix', () => {
    const compatibleHiggs = { ...makeHost('alpha'), device: 'Higgs 27.31.1.29' };

    it('respects the compatibility matrix', () => {
      expect(findCompatibleAppComponent(makeAppPackage('alpha'), compatibleHiggs))
        .toBe('alpha');
    });

    it('ignores the "device" string', () => {
      expect(() => findCompatibleAppComponent(makeAppPackage('Higgs'), compatibleHiggs))
        .toThrowErrorMatchingSnapshot();
    });
  });
});

it('ignores the "device" string for Higgs CU3', () => {
  expect(() => findCompatibleAppComponent(
    makeAppPackage('Higgs'),
    { ...makeHost(), device: 'Higgs 27.32.1.2' },
  )).toThrowErrorMatchingSnapshot();
});
