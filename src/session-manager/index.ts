import { SessionStorage } from "@src/types";
import { MapStorage } from "./map.storage";

class SessionManager {
  private storage: SessionStorage;

  constructor() {
    this.storage = new MapStorage();
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
