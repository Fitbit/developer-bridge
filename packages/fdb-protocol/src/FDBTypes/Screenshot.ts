import * as t from 'io-ts';

import { StreamToken } from './BulkData';
import { NonNegativeInteger } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * Capabilities specific to the capture of app screenshots.
 */
export const ScreenshotCapabilities = t.intersection(
  [
    t.partial({
      /**
       * The Host supports capturing screenshots and transferring them
       * to the Debugger in-band with bulk data transfer by supporting
       * the 'app.screenshot.stream.capture' request.
       */
      stream: t.boolean,
    }),
    t.interface({
      /**
       * The set of image formats that the Host supports for capturing
       * screenshots.
       */
      imageFormats: t.array(t.string),
    }),
  ],
  'ScreenshotCapabilities',
);
export type ScreenshotCapabilities = t.TypeOf<typeof ScreenshotCapabilities>;

export const AppScreenshotStreamCaptureParams = t.interface(
  {
    /**
     * The token for the stream on the Debugger that the Host should
     * write the captured screenshot to.
     */
    stream: StreamToken,

    /**
     * The image format to encode the captured screenshot.
     */
    imageFormat: t.string,
  },
  'AppScreenshotStreamCaptureParams',
);
export type AppScreenshotStreamCaptureParams = t.TypeOf<
  typeof AppScreenshotStreamCaptureParams
>;

export const AppScreenshotStreamCaptureResult = t.partial(
  {
    /**
     * The total size of the image, in bytes, before transfer encoding.
     */
    length: NonNegativeInteger,
  },
  'AppScreenshotStreamCaptureResult',
);
export type AppScreenshotStreamCaptureResult = t.TypeOf<
  typeof AppScreenshotStreamCaptureResult
>;
