import * as fs from 'fs';
import { write as gexfWrite } from 'graphology-gexf';

import * as AppPackage from '@fitbit/app-package';
import * as JSZip from 'jszip';
import * as yargs from 'yargs';

import { generateGraph, generateV8HeapSnapshot } from './convert';
import * as repl from 'node:repl';
import * as util from 'node:util';

enum OutputFormat {
  V8,
  GEXF,
}

async function makeGraph(
  snapshotPath: string,
  fbaPath: string,
  deviceType: string,
) {
  const fbaData = fs.readFileSync(fbaPath);
  const fbaZip = await JSZip.loadAsync(fbaData);
  const fba = await AppPackage.fromJSZip(fbaZip);

  const snapshotBuffer = fs.readFileSync(snapshotPath);

  if (
    !fba.sourceMaps ||
    !fba.sourceMaps.device ||
    !fba.sourceMaps.device[deviceType]
  ) {
    throw new Error(
      'Provided FBA file does not contain sourcemaps for requested device type!',
    );
  }

  const graph = await generateGraph(
    snapshotBuffer,
    'jerryscript-1',
    fba.sourceMaps.device[deviceType],
  );

  return graph;
}

async function convertCommand(
  snapshotPath: string,
  fbaPath: string,
  outputPath: string,
  deviceType: string,
  outputFormat: OutputFormat,
) {
  const graph = await makeGraph(snapshotPath, fbaPath, deviceType);

  let out: string;
  if (outputFormat === OutputFormat.V8) {
    const convertedSnapshot = generateV8HeapSnapshot(graph);
    out = JSON.stringify(convertedSnapshot);
  } else if (outputFormat === OutputFormat.GEXF) {
    out = gexfWrite(graph);
  } else {
    throw new Error('Unknown output format');
  }

  fs.writeFileSync(outputPath, out);
}

async function startRepl(
  snapshotPath: string,
  fbaPath: string,
  deviceType: string,
) {
  const graph = await makeGraph(snapshotPath, fbaPath, deviceType);

  process.stdout.write(
    'The graph is available as `g` and root nodes as `roots`.\n\nThe API is documented at https://graphology.github.io/.\n',
  );

  const r = repl.start({
    prompt: '> ',
    writer: (o: any) => util.inspect(o, { maxArrayLength: Infinity }),
  });

  r.context.g = graph;
  r.context.roots = graph.filterNodes(
    (n) => graph.inEdges(n).length === 0 && graph.outEdges(n).length > 0,
  );
}

const builder = (args: yargs.Argv<{}>) =>
  args
    .positional('snapshot', {
      description: 'Heap snapshot path',
      type: 'string',
      demandOption: true,
    })
    .positional('fba', {
      description: 'FBA file path',
      type: 'string',
      demandOption: true,
    })
    .positional('output', {
      description: 'Output heap data file path',
      type: 'string',
      demandOption: true,
    })
    .positional('deviceType', {
      description: 'Device type',
      type: 'string',
      demandOption: true,
    });

const cmd = (args: any, outFormat: OutputFormat) =>
  convertCommand(
    args.snapshot,
    args.fba,
    args.output,
    args.deviceType,
    outFormat,
  ).catch((error) => {
    process.exitCode = 1;
    if (error) console.error(error);
  });

yargs
  .command(
    'v8 <snapshot> <fba> <output> <deviceType>',
    'Convert heap snapshot to v8 heap snapshot',
    builder,
    (args) => {
      return cmd(args, OutputFormat.V8);
    },
  )
  .command(
    'gexf <snapshot> <fba> <output> <deviceType>',
    'Convert heap snapshot to a GEXF graph',
    builder,
    (args) => {
      return cmd(args, OutputFormat.GEXF);
    },
  )
  .command(
    'repl <snapshot> <fba> <deviceType>',
    'Start a Node REPL to explore the heap graph',
    (args) =>
      args
        .positional('snapshot', {
          description: 'Heap snapshot path',
          type: 'string',
          demandOption: true,
        })
        .positional('fba', {
          description: 'FBA file path',
          type: 'string',
          demandOption: true,
        })
        .positional('deviceType', {
          description: 'Device type',
          type: 'string',
          demandOption: true,
        }),
    (args) => {
      startRepl(args.snapshot, args.fba, args.deviceType);
    },
  )
  .demandCommand()
  .help().argv;
