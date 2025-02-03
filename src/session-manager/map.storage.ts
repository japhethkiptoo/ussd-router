import { SessionStorage } from "../types";

export class MapStorage implements SessionStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<any | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
