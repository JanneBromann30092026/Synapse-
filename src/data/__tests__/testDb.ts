import { db } from '../db';

/** Empties every table of the shared test database (fake-indexeddb). */
export async function resetDb(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}
