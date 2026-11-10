import { RedisOptions, SessionStorage } from "../types";
import { createClient } from "redis";
import { buildRedisUrl } from "./redis-url";

export class RedisStorage implements SessionStorage {
  private client: any;
  private connecting?: Promise<void>;
  private readonly defaultTtl?: number;

  constructor(options: RedisOptions & { session_ttl?: number }) {
    this.defaultTtl = options.session_ttl;

    if (options.client) {
      this.client = options.client;
    } else {
      this.client = createClient({ url: buildRedisUrl(options) });
      // Without an error listener node-redis errors crash the process.
      this.client.on("error", (err: unknown) => {
        console.error("Redis client error:", err);
      });
    }
  }

  /**
   * Connects once and shares the connection. Concurrent callers await the
   * same promise instead of each calling connect() ("Socket already opened").
   */
  private ready(): Promise<void> {
    if (this.client.isOpen) return Promise.resolve();

    if (!this.connecting) {
      this.connecting = Promise.resolve(this.client.connect()).then(
        () => undefined,
        (err: unknown) => {
          // Allow a later call to retry.
          this.connecting = undefined;
          throw err;
        },
      );
    }
    return this.connecting;
  }

  async get(key: string): Promise<any | null> {
    await this.ready();
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ready();
    const seconds = ttl ?? this.defaultTtl;
    const stringValue = JSON.stringify(value);
    if (seconds && seconds > 0) {
      await this.client.set(key, stringValue, { EX: Math.ceil(seconds) });
    } else {
      await this.client.set(key, stringValue);
    }
  }

  async delete(key: string): Promise<void> {
    await this.ready();
    await this.client.del(key);
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
    this.connecting = undefined;
  }
}
