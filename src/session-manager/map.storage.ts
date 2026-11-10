import { SessionStorage } from "../types";

type Entry = { value: any; expiresAt?: number };

const SWEEP_INTERVAL_MS = 60_000;

export class MapStorage implements SessionStorage {
  private store = new Map<string, Entry>();
  private lastSweep = Date.now();
  private readonly defaultTtl?: number;

  constructor(options?: { session_ttl?: number }) {
    this.defaultTtl = options?.session_ttl;
  }

  async get(key: string): Promise<any | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value ?? null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const seconds = ttl ?? this.defaultTtl;
    this.store.set(key, {
      value,
      expiresAt: seconds && seconds > 0 ? Date.now() + seconds * 1000 : undefined,
    });
    this.sweep();
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Removes expired keys, at most once per minute. */
  private sweep() {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
