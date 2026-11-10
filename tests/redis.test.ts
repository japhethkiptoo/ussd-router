import UssdNavigator from "../src";
import { buildRedisUrl } from "../src/session-manager/redis-url";
import { RedisStorage } from "../src/session-manager/redis.storage";

type UssdResponse = { message: string; end: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimal stand-in for a node-redis client that, like the real one, throws
// "Socket already opened" if connect() is called while connecting/open.
class FakeRedisClient {
  isOpen = false;
  private opening = false;
  connectCalls = 0;
  data = new Map<string, string>();
  setCalls: any[][] = [];

  async connect() {
    this.connectCalls++;
    if (this.isOpen || this.opening) throw new Error("Socket already opened");
    this.opening = true;
    await sleep(20);
    this.opening = false;
    this.isOpen = true;
  }
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(...args: any[]) {
    this.setCalls.push(args);
    this.data.set(args[0], args[1]);
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async quit() {
    this.isOpen = false;
  }
}

describe("buildRedisUrl", () => {
  test("includes the redis:// scheme", () => {
    expect(buildRedisUrl({ host: "localhost", port: "6379" })).toBe("redis://localhost:6379/0");
  });

  test("uses rediss:// for TLS", () => {
    expect(buildRedisUrl({ host: "cache.example.com", port: 6380, tls: true })).toBe(
      "rediss://cache.example.com:6380/0",
    );
  });

  test("encodes credentials and db", () => {
    expect(
      buildRedisUrl({ host: "h", port: 1, username: "u", password: "p@ss:word", db: 2 }),
    ).toBe("redis://u:p%40ss%3Aword@h:1/2");
    expect(buildRedisUrl({ host: "h", port: 1, username: "", password: "pw" })).toBe("redis://:pw@h:1/0");
  });

  test("accepts a url option directly", () => {
    expect(buildRedisUrl({ url: "rediss://user:pw@h:6380/1" })).toBe("rediss://user:pw@h:6380/1");
  });

  test("rejects a url without a redis scheme", () => {
    expect(() => buildRedisUrl({ url: "localhost:6379" })).toThrow(/redis:\/\//);
  });
});

describe("RedisStorage", () => {
  test("connects once when many requests arrive together", async () => {
    const client = new FakeRedisClient();
    const storage = new RedisStorage({ client });

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => storage.set(`k${i}`, { i })),
    );
    await Promise.all(Array.from({ length: 20 }, (_, i) => storage.get(`k${i}`)));

    expect(client.connectCalls).toBe(1);
    await expect(storage.get("k7")).resolves.toEqual({ i: 7 });
  });

  test("retries connecting after a failed connect", async () => {
    const client = new FakeRedisClient();
    const realConnect = client.connect.bind(client);
    let fail = true;
    client.connect = async () => {
      if (fail) {
        fail = false;
        client.connectCalls++;
        throw new Error("ECONNREFUSED");
      }
      return realConnect();
    };
    const storage = new RedisStorage({ client });
    await expect(storage.get("a")).rejects.toThrow("ECONNREFUSED");
    await expect(storage.get("a")).resolves.toBeNull();
  });

  test("session_ttl sets keys with EX", async () => {
    const client = new FakeRedisClient();
    const menu = new UssdNavigator<UssdResponse>({
      redis_config: { client },
      session_ttl: 90,
    });
    menu.startMenu({
      run: async () => {
        await menu.setSession({ a: 1 });
        return { message: "hi", end: false };
      },
    });
    await menu.run({ sessionID: "x", phoneNumber: "1", serviceCode: "*1#", input: "", path: [] });
    expect(client.setCalls.length).toBeGreaterThan(0);
    for (const call of client.setCalls) {
      expect(call[2]).toEqual({ EX: 90 });
    }
  });

  test("no EX without session_ttl", async () => {
    const client = new FakeRedisClient();
    const storage = new RedisStorage({ client });
    await storage.set("k", { v: 1 });
    expect(client.setCalls[0]).toEqual(["k", JSON.stringify({ v: 1 })]);
  });

  test("navigator accepts host/port config without connecting eagerly", () => {
    expect(
      () =>
        new UssdNavigator<UssdResponse>({
          redis_config: { host: "0.0.0.0", port: "6379", username: "", password: "" },
        }),
    ).not.toThrow();
  });
});
