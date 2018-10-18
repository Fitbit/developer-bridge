import vorpal from 'vorpal';

import { createMockHost, HostType } from '../models/mockHost';

export default function mockHost(cli: vorpal) {
  let handleCancel: () => void;

  async function mockHostAction(hostType: HostType, args: vorpal.Args) {
    const onCancel = new Promise<void>((resolve) => {
      handleCancel = resolve;
    });

    const maxAPIVersion = args.options.maxAPIVersion;
    const { closePromise, close } = await createMockHost(
      hostType,
      { maxAPIVersion },
      msg => cli.activeCommand.log(msg),
    );

    onCancel.then(close);
    return closePromise;
  }

  const hostTypes: HostType[] = ['app', 'companion'];
  for (const hostType of hostTypes) {
    cli
    .command(
      `mock-host ${hostType}`,
      `Create a fake developer bridge ${hostType} host (for testing)`,
    )
    .option('--maxAPIVersion <version>', 'Set the advertised max API version')
    .action(args => mockHostAction(hostType, args))
    .cancel(() => handleCancel());
  }
}
