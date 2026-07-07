// Opaque keyset-pagination cursor: base64url of `<createdAt ISO>|<id>`, the (timestamp, id) pair
// that makes the next page's WHERE clause both stable under concurrent inserts and a strict tie-
// break (createdAt alone isn't unique).
export interface CursorPosition {
  createdAt: string;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt}|${position.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  return { createdAt, id };
}
