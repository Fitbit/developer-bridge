import * as fetchUtil from './fetchUtil';
import makeResponse from '../testUtils/makeResponse';

describe('assertJSON()', () => {
  it.each([
    'application/text',
    'image/png',
    undefined,
  ])('rejects on Content-Type header of %s', (contentType) => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse({ headers: { 'Content-Type': contentType } }),
      ),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it.each([
    'application/json',
    'application/json; charset=utf-8',
  ])('resolves on Content-Type header of %s', (contentType) => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse({ headers: { 'Content-Type': contentType } }),
      ),
    ).resolves.toEqual({});
  });

  it('rejects if the response is not valid JSON', () => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse(
          { headers: { 'Content-Type': 'application/json' } },
          '{notvalid',
        ),
      ),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('accepts an alternative Content-Type to assert', () => {
    return expect(
      fetchUtil.assertJSON('application/vnd.document+json')(
        makeResponse({ headers: { 'Content-Type': 'application/vnd.document+json' } }),
      ),
    ).resolves.toEqual({});
  });
});

describe('okOrElse', () => {
  const mockFailure = jest.fn();

  it('resolves with the response if the response is ok', () => {
    const response = makeResponse();
    return expect(fetchUtil.okOrElse(mockFailure)(response)).resolves.toBe(response);
  });

  it('calls the failure method if the response is not ok', () => {
    const response = makeResponse({ status: 403 });
    fetchUtil.okOrElse(mockFailure)(response);
    expect(mockFailure).toBeCalledWith(response);
  });
});
