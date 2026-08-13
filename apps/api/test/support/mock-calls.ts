export function callArgs(mock: jest.Mock): unknown[][] {
  return mock.mock.calls as unknown[][];
}

export function callArg<T>(mock: jest.Mock, callIndex: number, argIndex: number): T {
  return callArgs(mock)[callIndex][argIndex] as T;
}
