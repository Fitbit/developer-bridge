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
    this.appPackage = await readFile(packagePath).then(JSZip.loadAsync).then(fromJSZip);
    this.appPackagePath = packagePath;

    this.onAppPackageLoad.post();
    return this.appPackage;
  }
}

export default AppContext;
