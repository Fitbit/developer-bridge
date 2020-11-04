import * as fs from 'fs';

import PortablePixmap from '@fitbit/portable-pixmap';
import { RemoteHost } from '@fitbit/fdb-debugger';
import { PNG } from 'pngjs';

const screenshotFormatPPM = 'P6.sRGB';

export default async function captureScreenshot(
  host: RemoteHost,
  destPath: string,
  options: {
    onWrite?: (received: number, total?: number) => void;
  } = {},
) {
  if (!host.canTakeScreenshot()) {
    throw new Error('Connected device does not support screenshots');
  }

  if (host.screenshotFormats().indexOf(screenshotFormatPPM) < 0) {
    throw new Error(
      'No image format supported by the device is supported by the debugger',
    );
  }

  // Open the file before starting to take the screenshot so that we
  // don't waste time if there is an error opening the file.
  const outStream = await new Promise<fs.WriteStream>((resolve, reject) => {
    // Open file in write-exclusive mode, which atomically creates
    // the file or fails if a file already exists at that path.
    const stream = fs.createWriteStream(destPath, { flags: 'wx' });

    stream.once('open', () => resolve(stream)).once('error', reject);
  });

  try {
    const pixmap = PortablePixmap.parse(
      await host.takeScreenshot(screenshotFormatPPM, options.onWrite),
    );

    const png = new PNG({
      width: pixmap.width,
      height: pixmap.height,
      colorType: 2, // Color, no alpha
    });

    pixmap.toRGBA8888(png.data);

    await new Promise((resolve, reject) => {
      png
        .pack()
        .once('error', (error) => outStream.destroy(error))
        .pipe(outStream)
        .once('error', reject)
        .once('close', resolve);
    });
  } catch (ex) {
    outStream.close();
    fs.unlinkSync(destPath);
    throw ex;
  }
}
