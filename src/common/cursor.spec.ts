import { decodeCursor, encodeCursor } from './cursor';

const ID = '01950000-0000-7000-8000-000000000001';
const AT = new Date('2025-02-10T09:00:00.000Z');

const b64 = (text: string) => Buffer.from(text).toString('base64url');

describe('cursor codec (design §9.2)', () => {
  it('encodes base64url of {"v":1,"at":"<ISO with milliseconds>","id":"<uuid>"}', () =>
    expect(
      encodeCursor({ at: new Date('2025-02-10T09:00:00.123Z'), id: ID }),
    ).toBe(b64(`{"v":1,"at":"2025-02-10T09:00:00.123Z","id":"${ID}"}`)));

  it('round-trips { at, id }; garbage, bad JSON, v:2, a bad date or a non-uuid id → null', () => {
    expect(decodeCursor(encodeCursor({ at: AT, id: ID }))).toEqual({
      at: AT,
      id: ID,
    });

    const at = '2025-02-10T09:00:00.000Z';
    expect(decodeCursor('!!!not a cursor!!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(b64('{"v":1,"at":'))).toBeNull();
    expect(decodeCursor(b64(`{"v":2,"at":"${at}","id":"${ID}"}`))).toBeNull();
    expect(
      decodeCursor(b64(`{"v":1,"at":"2025-02-30T09:00:00.000Z","id":"${ID}"}`)),
    ).toBeNull();
    expect(
      decodeCursor(b64(`{"v":1,"at":"2025-02-10","id":"${ID}"}`)),
    ).toBeNull();
    expect(
      decodeCursor(b64(`{"v":1,"at":"${at}","id":"not-a-uuid"}`)),
    ).toBeNull();
  });

  it('returns null for JSON that is not the cursor object', () => {
    const at = '2025-02-10T09:00:00.000Z';
    expect(decodeCursor(b64('null'))).toBeNull();
    expect(decodeCursor(b64(`["${at}","${ID}"]`))).toBeNull();
    expect(decodeCursor(b64('"text"'))).toBeNull();
    expect(
      decodeCursor(b64(`{"v":1,"at":1739178000000,"id":"${ID}"}`)),
    ).toBeNull();
    expect(decodeCursor(b64(`{"v":1,"at":"${at}"}`))).toBeNull();
    expect(decodeCursor(b64(`{"v":"1","at":"${at}","id":"${ID}"}`))).toBeNull();
    expect(
      decodeCursor(b64(`{"v":1,"at":"${at}","id":"${ID}","x":0}`)),
    ).toBeNull();
  });

  it('returns null, without throwing, for a value that is not a string', () =>
    expect(decodeCursor(['a', 'b'] as unknown as string)).toBeNull());
});
