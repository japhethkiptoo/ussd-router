import { RedisOptions, SessionStorage } from "../types";
import { MapStorage } from "./map.storage";

type SessionManagerOptions = {
  redis_config?: RedisOptions;
};

class SessionManager {
  private storage: SessionStorage;

  constructor(options?: SessionManagerOptions) {
    if (options?.redis_config) {
      try {
        const { RedisStorage } = require("./redis.storage");
        this.storage = new RedisStorage({
          ...(options.redis_config && options.redis_config),
        });
      } catch (e) {
        console.warn("Redis is not available");
        throw new Error("Redis is not available");
      }
    } else {
      this.storage = new MapStorage();
    }
  }

  async get(sessionId: string): Promise<any | null> {
    return this.storage.get(sessionId);
  }

  async set(sessionId: string, data: any): Promise<void> {
    return this.storage.set(sessionId, data);
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
