declare function sha256(
  buf: string | Buffer | ArrayBufferView,
): Promise<string>;

declare namespace sha256 {
  function sync(buf: string | Buffer | ArrayBufferView): string;
}

export = sha256;
