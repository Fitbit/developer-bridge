import { AppPackage, fromJSZip } from '@fitbit/app-package';
import JSZip from 'jszip';
import { VoidSyncEvent } from 'ts-events';

import { readFile } from '../util/promiseFs';

export interface AppPackageStore {
  onAppPackageLoad: VoidSyncEvent;
  appPackage?: AppPackage;
}

class AppContext implements AppPackageStore {
  public onAppPackageLoad = new VoidSyncEvent();
  public appPackage?: AppPackage;
  public appPackagePath?: string;

  async loadAppPackage(packagePath: string) {
    const appPackage = await readFile(packagePath).then(JSZip.loadAsync).then(fromJSZip);

    this.appPackage = appPackage;
    this.appPackagePath = packagePath;

    this.onAppPackageLoad.post();
    return appPackage;
  }
}

export default AppContext;
