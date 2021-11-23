import { writeFile, mkdir } from 'fs';
import RelayServer from './RelayServer';
import { relayDirectoryPath, relayPidFilePath } from './Config';

const server = new RelayServer();
const port = server.listen();

const info = { port, pid: process.pid };

mkdir(relayDirectoryPath, (error) => {
  if (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  writeFile(relayPidFilePath, JSON.stringify(info), { flag: 'w' }, (error) => {
    if (error) throw error;

    console.log(`Wrote relay info to ${relayPidFilePath}`, info);
  });
});
