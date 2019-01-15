import child_process from 'child_process';
import os from 'os';

import fsExtra from 'fs-extra';
import lodash from 'lodash';
import vorpal from 'vorpal';

export const buildProcess = () => {
  return new Promise((resolve, reject) => {
    const buildProcess = child_process.spawn(
      'npm',
      ['run-script', 'build'],
      { stdio: 'inherit', shell: true },
    );
    buildProcess.on('exit', (code) => {
      code === 0 ? resolve() : reject(code);
    });
  });
};

export const buildAction = async (cli: vorpal) => {
  const packageJSONPath = 'package.json';
  const packageJSON = await fsExtra.readJSON(packageJSONPath);
  const buildScriptKey = 'scripts.build';

  if (!lodash.get(packageJSON, buildScriptKey)) {
    const { addBuildScript } = await cli.activeCommand.prompt<{ addBuildScript: boolean }>(
      {
        name: 'addBuildScript',
        type: 'confirm',
        message: 'No build script is configured, would you like to use the default?',
        default: false,
      },
    );

    if (!addBuildScript) {
      cli.activeCommand.log('Cannot build, no build script available.');
      return false;
    }

    lodash.set(packageJSON, buildScriptKey, 'fitbit-build');
    await fsExtra.writeJSON(
      packageJSONPath,
      packageJSON,
      { spaces: 2, EOL: os.EOL },
    );
  }
  return buildProcess();
};

export default function build(cli: vorpal) {
  cli
    .command('build', 'Build application')
    .action(async () => buildAction(cli));
}
