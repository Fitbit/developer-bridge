import fetchPonyfill from 'fetch-ponyfill';

const { fetch, Headers, Request, Response } = fetchPonyfill();

export default fetch;
export { Headers, Request, Response };
