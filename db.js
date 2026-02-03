import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join } from 'path';
const file = join(process.cwd(), 'db.json');
const adapter = new JSONFile(file);
export const db = new Low(adapter);
await db.read();
db.data ||= { users: [], messages: [] };
await db.write();