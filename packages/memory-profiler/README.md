@fitbit/memory-profiler
===============

A collection of tools for analyzing the memory usage of Fitbit SDK applications.

This can convert the heap snapshots from the debug bridge (the `jerryscript-1` format) into the
format (V8 heap snapshot) that can be used directly with Chrome Dev Tools.  It can also generate
GEXF graph output as well as launch a REPL to explore the heap graph.

There is no published spec on the heap snapshot files for Chrome/v8, but the format seems simple
enough.  The following resources are helpful in understanding it:

 - https://www.alibabacloud.com/blog/locate-online-node-js-memory-leaks_595120
 - https://blog.actorsfit.com/a?ID=00001-39d9f16f-bb77-42c3-a467-ee8a50e70e2c
 - https://github.com/v8/v8/blob/master/include/v8-profiler.h
 - https://github.com/SrTobi/v8-heapsnapshot/blob/master/src/index.ts
 - https://gist.github.com/mmarchini/303b1699d936d3649a09714be21e1262
 - https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/heap_snapshot_model/HeapSnapshotModel.ts
 - https://github.com/ChromeDevTools/devtools-frontend/tree/main/front_end/entrypoints/heap_snapshot_worker

# Usage

## V8 heap snapshot

With your device connected (`connect device`) and FBA loaded (`set-app-package` or `install`), simply run the `heap-snapshot` command. A `.heapsnapshot` file will be produced in the current directory.

Then load the `.heapsnapshot` file in Chrome Dev Tools under the Memory tab. You can also take
successive snapshots and load them in Chrome Dev Tools and compare them to see how the heap has
changed, though note that IDs are not stable currently which limits the usefulness of this.

## Explore in a REPL

If you want to manually explore the heap graph to really dig into things, you can load a REPL
with the graph of the jerryscript heap snapshot already loaded. Run:

```
$ node lib/cli.js repl /path/to/fitbit-project/js-heap.bin /path/to/fitbit-project/build/app.fba atlas
```

(replacing the paths and `atlas` with your device type).

It will give you some help text and a prompt to begin.
