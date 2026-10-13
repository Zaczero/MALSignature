import type { Database } from "bun:sqlite";

export const activityHour = 3_600_000;
export const popularityWindow = 30 * 24 * activityHour;
const day = 24 * activityHour;

export function popularityScore(covered: number) {
  if (covered >= popularityWindow) return 100;
  return Math.min(999, Math.ceil((covered * 1000) / popularityWindow)) / 10;
}

export class Activity {
  constructor(readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS signature_activity (
        username TEXT NOT NULL COLLATE NOCASE,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL CHECK (end > start),
        PRIMARY KEY (username, start)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS signature_popularity (
        username TEXT PRIMARY KEY COLLATE NOCASE,
        covered INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS popularity_snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated INTEGER NOT NULL
      );
    `);
  }

  record(username: string, time: number): boolean {
    return this.db
      .transaction(() => {
        const previous = this.db
          .query<{ start: number; end: number }, [string, number]>(
            "SELECT start, end FROM signature_activity WHERE username = ? AND start <= ? ORDER BY start DESC LIMIT 1",
          )
          .get(username, time);
        let start = time;
        let end = time + activityHour;
        if (previous && previous.end >= end) return false;
        if (previous && previous.end >= start) {
          start = previous.start;
          end = Math.max(end, previous.end);
        }
        const overlaps = this.db
          .query<{ end: number }, [string, number, number]>(
            "DELETE FROM signature_activity WHERE username = ? AND start > ? AND start <= ? RETURNING end",
          )
          .all(username, start, end);
        for (const overlap of overlaps) end = Math.max(end, overlap.end);
        return (
          this.db
            .query(
              `INSERT INTO signature_activity (username, start, end)
               SELECT username, ?, ? FROM signatures WHERE username = ?
               ON CONFLICT (username, start) DO UPDATE SET end = excluded.end`,
            )
            .run(start, end, username).changes > 0
        );
      })
      .immediate();
  }

  updated(): number | null {
    return (
      this.db
        .query<{ updated: number }, []>(
          "SELECT updated FROM popularity_snapshot WHERE id = 1",
        )
        .get()?.updated ?? null
    );
  }

  snapshot(time: number) {
    this.db
      .transaction(() => {
        const cutoff = time - popularityWindow;
        this.db
          .query("DELETE FROM signature_activity WHERE end <= ?")
          .run(cutoff);
        this.db.exec("DELETE FROM signature_popularity");
        this.db
          .query(
            `INSERT INTO signature_popularity (username, covered)
             SELECT signatures.username,
               COALESCE(SUM(MIN(activity.end, ?) - MAX(activity.start, ?)), 0)
             FROM signatures LEFT JOIN signature_activity AS activity
               ON activity.username = signatures.username
                 AND activity.end > ? AND activity.start < ?
             GROUP BY signatures.username`,
          )
          .run(time, cutoff, cutoff, time);
        this.db
          .query(
            "INSERT INTO popularity_snapshot (id, updated) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET updated = excluded.updated",
          )
          .run(time);
      })
      .immediate();
    return time;
  }

  snapshotTime(time: number): number {
    const updated = this.updated();
    if (
      updated !== null &&
      Math.floor(updated / day) === Math.floor(time / day)
    )
      return updated;
    return this.snapshot(time);
  }
}
