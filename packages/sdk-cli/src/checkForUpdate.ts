import { readJSONSync } from 'fs-extra';
import path from 'path';

import chalk from 'chalk';
import { Settings, UpdateNotifier } from 'update-notifier';

type UpdateNotifierFunc = (settings?: Settings) => UpdateNotifier;

export default function checkForUpdate(updateNotifier: UpdateNotifierFunc) {
  const packageJSON = readJSONSync(path.join(__dirname, '../package.json'));

  const { update } = updateNotifier({ pkg: packageJSON });

  if (update) {
    const message = `${update.name} update available ${update.current} → ${update.latest}`;
    console.log(chalk.keyword('orange')(message));
  }
}
