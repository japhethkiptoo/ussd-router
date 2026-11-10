import { RedisOptions, SessionStorage } from "../types";
import { MapStorage } from "./map.storage";

export type SessionManagerOptions = {
  redis_config?: RedisOptions;
  /** Custom session store. Takes precedence over `redis_config`. */
  storage?: SessionStorage;
  /** Session key expiry in seconds. */
  session_ttl?: number;
};

class SessionManager {
  private storage: SessionStorage;
  private readonly sessionTtl?: number;

  constructor(options?: SessionManagerOptions) {
    this.sessionTtl = options?.session_ttl ?? options?.redis_config?.session_ttl;

    if (options?.storage) {
      this.storage = options.storage;
    } else if (options?.redis_config) {
      let RedisStorage: any;
      try {
        ({ RedisStorage } = require("./redis.storage"));
      } catch (e) {
        console.warn("Redis is not available", e);
        throw new Error(
          "Redis is not available. Install the `redis` package to use redis_config.",
        );
      }
      this.storage = new RedisStorage({
        ...options.redis_config,
        session_ttl: this.sessionTtl,
      });
    } else {
      this.storage = new MapStorage({ session_ttl: this.sessionTtl });
    }
  }

  async get(sessionId: string): Promise<any | null> {
    return this.storage.get(sessionId);
  }

  async set(sessionId: string, data: any): Promise<void> {
    return this.sessionTtl
      ? this.storage.set(sessionId, data, this.sessionTtl)
      : this.storage.set(sessionId, data);
  }

  async update(sessionId: string, data: any): Promise<void> {
    const current = await this.get(sessionId);

    if (current) {
      return this.set(sessionId, { ...current, ...data });
    }

    return this.set(sessionId, { ...data });
  }

  async drop(sessionId: string): Promise<void> {
    return this.storage.delete(sessionId);
  }
}

export default SessionManager;
