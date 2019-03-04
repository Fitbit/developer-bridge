import * as stream from 'stream';

export default class StreamTap extends stream.Transform {
  constructor(private callback: (chunk: any) => void) {
    super({ objectMode: true });
  }

  // tslint:disable-next-line:function-name
  _transform(chunk: any, encoding: string, callback: (err?: Error) => void) {
    this.callback(chunk);
    this.push(chunk);
    callback();
  }
}
