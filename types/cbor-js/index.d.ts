declare namespace CBOR {
  function encode(obj: any): ArrayBuffer;
  function decode(buf: ArrayBuffer): object;
}

export = CBOR;
