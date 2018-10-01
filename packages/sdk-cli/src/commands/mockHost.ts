import vorpal from 'vorpal';
import WebSocket from 'ws';

import * as debuggerHost from '../models/debuggerHost';

export default function mockHost(cli: vorpal) {
  let socket: WebSocket | undefined;

  async function mockHostAction(hostType: debuggerHost.HostType, args: vorpal.Args) {
    const maxAPIVersion = args.options.maxAPIVersion;
    socket = await debuggerHost.createHostConnection(hostType);
    return debuggerHost.createDebuggerHost(
      socket,
      hostType,
      msg => cli.activeCommand.log(msg),
      { maxAPIVersion },
    );
  }

  const hostTypes: debuggerHost.HostType[] = ['app', 'companion'];
  for (const hostType of hostTypes) {
    cli
    .command(
      `mock-host ${hostType}`,
      `Create a fake developer bridge ${hostType} host (for testing)`,
    )
    .option('--maxAPIVersion <version>', 'Set the advertised max API version')
    .action(args => mockHostAction(hostType, args))
    .cancel(() => {
      if (socket) socket.close();
    });
  }
}
