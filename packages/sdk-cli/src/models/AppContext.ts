import { VoidSyncEvent } from 'ts-events';

import AppPackage from './AppPackage';
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
    const appPackageData = await readFile(packagePath);
    this.appPackage = await AppPackage.fromArtifact(appPackageData);
    this.appPackagePath = packagePath;

    this.onAppPackageLoad.post();
    return this.appPackage;
  }
}

export default AppContext;
