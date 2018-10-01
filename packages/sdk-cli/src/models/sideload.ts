import { RemoteHost } from '@fitbit/fdb-debugger';

import AppPackage from '../models/AppPackage';
import * as compatibility from '../models/compatibility';

type ProgressCallback = (sent: number, total: number) => void;

export function app(
  host: RemoteHost,
  appPackage: AppPackage,
  onProgress: ProgressCallback,
) {
  const family = compatibility.findCompatibleAppComponent(appPackage, host.info);
  return host.installApp(
    'app',
    appPackage.components.device[family].artifact,
    { onProgress },
  );
}

export function companion(
  host: RemoteHost,
  appPackage: AppPackage,
  onProgress: ProgressCallback,
) {
  compatibility.assertCompanionComponentIsCompatible(appPackage, host.info);
  return host.installApp(
    'companion',
    appPackage.components.companion!,
    { onProgress },
  );
}
