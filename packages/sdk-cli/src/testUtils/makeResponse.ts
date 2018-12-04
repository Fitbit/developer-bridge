import { Response } from '../fetch';

export default function makeResponse(
  init: ResponseInit = { status: 200 },
  body = '{}',
) {
  const response = new Response(
    body,
    {
      statusText: `Status ${init.status}`,
      ...init,
    },
  );

  Object.defineProperty(response, 'url', {
    value: 'http://api',
    writable: false,
  });

  return response;
}
