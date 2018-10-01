import vorpal from 'vorpal';

import HostConnections, { HostConnection } from '../models/HostConnections';

export default function repl(stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    const { hostConnections } = stores;

    const isHostConnected = (host: HostConnection | undefined) => host && !host.host.rpc.ended;

    const exitWithError = (message: string) => {
      cli.activeCommand.log(message);
      (cli as any)._exitMode({
        sessionId: cli.session.id,
      });
    };

    cli
      .mode('repl device')
      .description('Enter into a REPL with the connected device')
      .delimiter('repl$')
      .init(async () => {
        const hostConnection = stores.hostConnections.appHost;

        if (!isHostConnected(hostConnection)) {
          return exitWithError('No device connected');
        }
        if (!hostConnection!.host.hasEvalSupport()) {
          return exitWithError('Connected device does not support REPL');
        }

        cli.activeCommand.log('Entering REPL mode, type "exit" to quit');
      })
      .action(async (command: string) => {
        const hostConnection = hostConnections.appHost;

        if (!isHostConnected(hostConnection)) {
          cli.activeCommand.log('Host disconnected, exiting REPL');
          cli.execSync('exit');
          return;
        }

        try {
          const result = await hostConnection!.host.eval(command);
          // No log on failure since a log/trace will be emitted
          if (result.success) cli.activeCommand.log(result.value);
        } catch (ex) {
          cli.activeCommand.log(ex);
        }
      });
  };
}
