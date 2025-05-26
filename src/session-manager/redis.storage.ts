import { RedisOptions, SessionStorage } from "@/types";
import { createClient, RedisClientType } from "redis";

export class RedisStorage implements SessionStorage {
  private client: RedisClientType;

  constructor(options: RedisOptions) {
    //[[username][:password]@][host][:port][/db-number]
    const { host, username, password, port } = options;
    const url = this.createConnectionUrl({ host, port, username, password });

    this.client = createClient({ url });
  }

  createConnectionUrl({
    useSsl,
    username,
    password,
    host,
    port,
    dbNumber = 0,
  }: {
    useSsl?: boolean;
    username?: string;
    password?: string;
    host: string;
    port: string | number;
    dbNumber?: number;
  }) {
    const scheme = useSsl ? "rediss" : "redis";

    let authPart = "";
    if (username && password) {
      authPart = `${username}:${password}@`;
    } else if (password) {
      authPart = `:${password}@`;
    }

    return `${scheme}://${authPart}${host}:${port}/${dbNumber}`;
  }

  async get(key: string): Promise<any | null> {
    try {
      // Connect to Redis if not already connected
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      const value = await this.client.get(key);
      // Parse the JSON string if it exists
      return value ? JSON.parse(value) : null;
    } catch (error) {
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      // Connect to Redis if not already connected
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      // Convert value to JSON string before storing
      const stringValue = JSON.stringify(value);
      await this.client.set(key, stringValue);
    } catch (error) {
      console.error("Redis set error:", error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // Connect to Redis if not already connected
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      await this.client.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client.isOpen) {
        await this.client.quit();
      }
    } catch (error) {
      console.error("Redis disconnect error:", error);
      throw error;
    }
  }
}
