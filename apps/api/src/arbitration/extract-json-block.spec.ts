import { extractFirstJsonBlock } from './extract-json-block';

describe('extractFirstJsonBlock', () => {
  it('parses a bare json object', () => {
    expect(extractFirstJsonBlock('{"outcome":"RELEASE_TO_SELLER"}')).toEqual({
      outcome: 'RELEASE_TO_SELLER',
    });
  });

  it('pulls the object out of surrounding prose', () => {
    const text = 'Here is my answer:\n{"confidence":0.82}\nLet me know if you need more.';

    expect(extractFirstJsonBlock(text)).toEqual({ confidence: 0.82 });
  });

  it('pulls the object out of a fenced code block', () => {
    const text = '```json\n{"outcome":"SPLIT","splitSellerBps":6000}\n```';

    expect(extractFirstJsonBlock(text)).toEqual({ outcome: 'SPLIT', splitSellerBps: 6000 });
  });

  it('keeps nested objects intact', () => {
    const text = 'result: {"a":{"b":{"c":1}},"d":2} done';

    expect(extractFirstJsonBlock(text)).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  it('is not fooled by braces inside string values', () => {
    const text = '{"rationale":"the seller said {refund} in chat","confidence":0.5}';

    expect(extractFirstJsonBlock(text)).toEqual({
      rationale: 'the seller said {refund} in chat',
      confidence: 0.5,
    });
  });

  it('is not fooled by an escaped quote inside a string value', () => {
    const text = '{"rationale":"he said \\"no refund\\" twice"}';

    expect(extractFirstJsonBlock(text)).toEqual({ rationale: 'he said "no refund" twice' });
  });

  it('takes the first complete object when several are present', () => {
    const text = '{"first":1} and then {"second":2}';

    expect(extractFirstJsonBlock(text)).toEqual({ first: 1 });
  });

  it('returns null when there is no object at all', () => {
    expect(extractFirstJsonBlock('I am not sure how to answer that.')).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(extractFirstJsonBlock('{"outcome":"RELEASE_TO_SELLER"')).toBeNull();
  });

  it('returns null when the extracted block is not valid json', () => {
    expect(extractFirstJsonBlock('{outcome: RELEASE_TO_SELLER}')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractFirstJsonBlock('')).toBeNull();
  });
});
