import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Activity, activityHour, popularityScore } from "./activity";
import { ProfileError, usernameInput } from "./profile";

export interface StateOptions {
  /**
   * When > 0, coalesce view counts, last_seen timestamps, and activity
   * intervals in memory and flush them in a single WAL transaction on this
   * cadence (and before publish, prune, ranking, or close).
   */
  flushIntervalMs?: number;
}

const maxBufferedEntries = 1000;

export interface Signature {
  username: string;
  views: number;
  updated: number;
  last_seen: number;
  input_hash: string | null;
  normal: string | null;
  small: string | null;
}
export interface Ranking {
  updatedAt: string;
  entries: [username: string, popularity: number][];
}
export interface ViewRanking {
  updatedAt: string;
  entries: [username: string, views: number][];
}
export interface Retry {
  failures: number;
  retry_at: number;
  status: number;
  message: string;
}

export class State {
  readonly db: Database;
  readonly activity: Activity;
  private readonly flushIntervalMs: number;
  private readonly pendingViews = new Map<
    string,
    { username: string; views: number; lastSeen: number }
  >();
  private readonly pendingActivity = new Map<
    string,
    { username: string; start: number; end: number }
  >();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(directory: string, options: StateOptions = {}) {
    mkdirSync(directory, { recursive: true });
    this.flushIntervalMs = options.flushIntervalMs ?? 0;
    this.db = new Database(join(directory, "signatures.sqlite"), {
      create: true,
      strict: true,
    });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -4000;
      CREATE TABLE IF NOT EXISTS signatures (
        username TEXT PRIMARY KEY COLLATE NOCASE,
        views INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER NOT NULL DEFAULT 0,
        input_hash TEXT,
        normal TEXT,
        small TEXT
      );
      CREATE TABLE IF NOT EXISTS refresh_failures (
        username TEXT PRIMARY KEY COLLATE NOCASE,
        failures INTEGER NOT NULL,
        retry_at INTEGER NOT NULL,
        status INTEGER NOT NULL,
        message TEXT NOT NULL,
        profile_missing INTEGER NOT NULL DEFAULT 0 CHECK (profile_missing IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS upstream_retry (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        retry_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generation_windows (
        bucket TEXT PRIMARY KEY,
        window INTEGER NOT NULL,
        used INTEGER NOT NULL
      );
    `);
    this.db
      .transaction(() => {
        if (
          !this.db
            .query<{ name: string }, []>("PRAGMA table_info(refresh_failures)")
            .all()
            .some((column) => column.name === "profile_missing")
        ) {
          this.db.exec(
            "ALTER TABLE refresh_failures ADD COLUMN profile_missing INTEGER NOT NULL DEFAULT 0 CHECK (profile_missing IN (0, 1))",
          );
          this.db.exec(
            "UPDATE refresh_failures SET profile_missing = 1 WHERE status IN (404, 410)",
          );
        }
      })
      .immediate();
    this.activity = new Activity(this.db);
    if (this.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        try {
          this.flush();
        } catch (error) {
          console.error("State flush failed:", error);
        }
      }, this.flushIntervalMs);
      this.flushTimer.unref();
    }
  }
  get(username: string): Signature | null {
    const row = this.db
      .query<Signature, [string]>("SELECT * FROM signatures WHERE username = ?")
      .get(username);
    if (!row) return null;
    const pending = this.pendingViews.get(row.username.toLowerCase());
    if (!pending) return row;
    return {
      ...row,
      views: row.views + pending.views,
      last_seen: Math.max(row.last_seen, pending.lastSeen),
    };
  }
  access(username: string, countView: boolean): Signature | null {
    const now = Date.now();
    if (this.flushIntervalMs > 0) {
      const row = this.get(username);
      if (!row) return null;
      const key = row.username.toLowerCase();
      const existing = this.pendingViews.get(key);
      if (existing) {
        if (countView) existing.views += 1;
        if (now > existing.lastSeen) existing.lastSeen = now;
      } else {
        this.pendingViews.set(key, {
          username: row.username,
          views: countView ? 1 : 0,
          lastSeen: now,
        });
      }
      if (this.pendingViews.size >= maxBufferedEntries) this.flush();
      return {
        ...row,
        views: row.views + (countView ? 1 : 0),
        last_seen: Math.max(row.last_seen, now),
      };
    }
    return this.db
      .query<Signature, [number, number, string]>(
        "UPDATE signatures SET last_seen = ?, views = views + ? WHERE username = ? RETURNING *",
      )
      .get(now, countView ? 1 : 0, username);
  }
  recordActivity(username: string, time: number): boolean {
    if (this.flushIntervalMs <= 0) {
      return this.activity.record(username, time);
    }
    const key = username.toLowerCase();
    const start = time;
    const end = time + activityHour;
    const existing = this.pendingActivity.get(key);
    if (existing) {
      // Merge directly when the new interval overlaps or abuts the buffered span.
      if (start <= existing.end && end >= existing.start) {
        if (start < existing.start) existing.start = start;
        if (end > existing.end) existing.end = end;
        return true;
      }
      // Disjoint/out-of-order span: flush buffered state before recording.
      this.flush();
    }
    this.pendingActivity.set(key, { username, start, end });
    if (this.pendingActivity.size >= maxBufferedEntries) this.flush();
    return true;
  }
  flush() {
    if (this.pendingViews.size === 0 && this.pendingActivity.size === 0) return;
    this.db
      .transaction(() => {
        if (this.pendingViews.size > 0) {
          const update = this.db.query(
            "UPDATE signatures SET last_seen = max(last_seen, ?), views = views + ? WHERE username = ?",
          );
          for (const entry of this.pendingViews.values()) {
            update.run(entry.lastSeen, entry.views, entry.username);
          }
        }
        for (const span of this.pendingActivity.values()) {
          this.activity.recordIntervalInTransaction(
            span.username,
            span.start,
            span.end,
          );
        }
      })
      .immediate();
    this.pendingViews.clear();
    this.pendingActivity.clear();
  }
  publish(
    username: string,
    normal: string,
    small: string,
    inputHash: string | null,
  ) {
    this.flush();
    this.db.transaction(() => {
      this.db
        .query(`INSERT INTO signatures(username, normal, small, updated, last_seen, input_hash)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET
      normal = excluded.normal, small = excluded.small, updated = excluded.updated, input_hash = excluded.input_hash`)
        .run(username, normal, small, Date.now(), Date.now(), inputHash);
      this.db
        .query("DELETE FROM refresh_failures WHERE username = ?")
        .run(username);
    })();
  }
  retry(username: string): Retry | null {
    const local = this.db
      .query<Retry, [string]>(
        "SELECT * FROM refresh_failures WHERE username = ?",
      )
      .get(username);
    const upstream = this.db
      .query<{ retry_at: number }, []>(
        "SELECT retry_at FROM upstream_retry WHERE id = 1",
      )
      .get();
    if (
      upstream &&
      upstream.retry_at > Date.now() &&
      (!local || upstream.retry_at > local.retry_at)
    ) {
      return {
        failures: 0,
        retry_at: upstream.retry_at,
        status: 503,
        message: "MyAnimeList is taking a break. Please try again later.",
      };
    }
    return local && local.retry_at > Date.now() ? local : null;
  }
  defer(username: string, error: unknown) {
    const previous = this.db
      .query<{ failures: number; profile_missing: number }, [string]>(
        "SELECT failures, profile_missing FROM refresh_failures WHERE username = ?",
      )
      .get(username);
    const failures = (previous?.failures || 0) + 1;
    const status = error instanceof ProfileError ? error.status : 503;
    const missing = status === 404 || status === 410;
    const delay = Math.min(
      (missing ? 3600 : 900) * 2 ** Math.min(failures - 1, 10),
      missing ? 7 * 86400 : 86400,
    );
    const retryAfter = error instanceof ProfileError ? error.retryAfter : 0;
    const retryAt = Date.now() + Math.max(delay, retryAfter) * 1000;
    this.db
      .query(
        "INSERT OR REPLACE INTO refresh_failures(username, failures, retry_at, status, message, profile_missing) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        username,
        failures,
        retryAt,
        status,
        error instanceof ProfileError
          ? error.message
          : "The signature could not be refreshed. Please try again later.",
        missing || previous?.profile_missing ? 1 : 0,
      );
    if (error instanceof ProfileError && (status === 429 || status === 503)) {
      this.db
        .query(
          "INSERT INTO upstream_retry VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET retry_at = max(retry_at, excluded.retry_at)",
        )
        .run(Date.now() + Math.max(900, retryAfter) * 1000);
    }
    return retryAt;
  }
  admit({
    bucket,
    limit,
    seconds,
  }: {
    bucket: string;
    limit: number;
    seconds: number;
  }): number {
    const now = Date.now();
    const window = Math.floor(now / (seconds * 1000));
    return this.db
      .transaction(() => {
        const current = this.db
          .query<{ window: number; used: number }, [string]>(
            "SELECT window, used FROM generation_windows WHERE bucket = ?",
          )
          .get(bucket);
        const used = current?.window === window ? current.used : 0;
        if (used >= limit) {
          return Math.ceil(((window + 1) * seconds * 1000 - now) / 1000);
        }
        this.db
          .query("INSERT OR REPLACE INTO generation_windows VALUES (?, ?, ?)")
          .run(bucket, window, used + 1);
        return 0;
      })
      .immediate();
  }
  prune(cutoff: number): string[] {
    this.flush();
    return this.db
      .transaction(() => {
        const rows = this.db
          .query<Signature, [number]>(
            "SELECT * FROM signatures WHERE last_seen < ? AND (normal IS NOT NULL OR small IS NOT NULL)",
          )
          .all(cutoff);
        this.db
          .query(
            "UPDATE signatures SET normal = NULL, small = NULL, updated = 0 WHERE last_seen < ? AND (normal IS NOT NULL OR small IS NOT NULL)",
          )
          .run(cutoff);
        return rows.flatMap((row) =>
          [row.normal, row.small].filter((key): key is string => key !== null),
        );
      })
      .immediate();
  }
  imageKeys(): Set<string> {
    const rows = this.db
      .query<{ key: string }, []>(
        "SELECT normal AS key FROM signatures WHERE normal IS NOT NULL UNION SELECT small AS key FROM signatures WHERE small IS NOT NULL",
      )
      .all();
    return new Set(rows.map((row) => row.key));
  }
  ranking(time = Date.now()): Ranking {
    this.flush();
    return this.db
      .transaction((): Ranking => {
        const updated = this.activity.snapshotTime(time);
        const rows = this.db
          .query<{ username: string; covered: number }, []>(
            `SELECT signatures.username, popularity.covered FROM signatures
             JOIN signature_popularity AS popularity
               ON popularity.username = signatures.username
             WHERE NOT EXISTS (
               SELECT 1 FROM refresh_failures
               WHERE refresh_failures.username = signatures.username COLLATE NOCASE
                 AND profile_missing = 1
             )
             ORDER BY popularity.covered DESC, signatures.username COLLATE NOCASE`,
          )
          .all();
        return {
          updatedAt: new Date(updated).toISOString(),
          entries: rows.map((row) => [
            row.username,
            popularityScore(row.covered),
          ]),
        };
      })
      .immediate();
  }
  importRanking(ranking: ViewRanking) {
    this.flush();
    let skipped = 0;
    this.db.transaction(() => {
      const insert =
        this.db.query(`INSERT INTO signatures(username, views) VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE SET views = max(signatures.views, excluded.views)`);
      for (const [username, views] of ranking.entries) {
        if (
          typeof username !== "string" ||
          !Number.isSafeInteger(views) ||
          views < 0
        ) {
          throw new Error("Invalid ranking entry");
        }
        let normalized: string;
        try {
          normalized = usernameInput(username);
        } catch (error) {
          if (!(error instanceof ProfileError)) throw error;
          skipped++;
          continue;
        }
        insert.run(normalized, views);
      }
    })();
    return { imported: ranking.entries.length - skipped, skipped };
  }
  close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.db.close();
  }
}
