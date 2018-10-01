export default function mockWithPromiseWaiter<T>(mockFn: jest.Mock, returnValue?: any) {
  return new Promise<T>((resolve) => {
    mockFn.mockReset();
    mockFn.mockImplementationOnce((arg: T) => {
      resolve(arg);
      return returnValue;
    });
  });
}
