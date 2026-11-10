import UssdNavigator from "../src";
import type { SessionStorage } from "../src";

type UssdResponse = { message: string; end: boolean };

class SpyStorage implements SessionStorage {
  map = new Map<string, any>();
  ttls: (number | undefined)[] = [];
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: any, ttl?: number) {
    this.ttls.push(ttl);
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function build(options?: ConstructorParameters<typeof UssdNavigator>[0]) {
  const menu = new UssdNavigator<UssdResponse>({ max_retries: 1, ...options });
  menu.startMenu({
    run: () => ({ message: "Start", end: false }),
    next: [{ pattern: "1", action: "amount" }],
  });
  menu.addMenu("amount", {
    run: async () => {
      await menu.setSession({ visited: true });
      return { message: "Amount", end: false };
    },
    next: [{ pattern: "100", action: "done" }],
    retry_message: "Bad amount",
  });
  menu.addMenu("done", { run: () => ({ message: "Done", end: true }) });
  menu.addMenu(menu.sorry_menu, { run: () => ({ message: "Sorry", end: true }) });
  return menu;
}

const req = (sessionID: string, path: string[]) => ({
  sessionID,
  phoneNumber: "254700000000",
  serviceCode: "*1#",
  input: path[path.length - 1] ?? "",
  path,
});

describe("Session storage", () => {
  test("custom storage option is used", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage });
    await menu.run(req("s1", ["1"]));
    expect(storage.map.get("s1")).toMatchObject({ visited: true });
  });

  test("retry counts are kept in session storage and enforce max_retries", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage, max_retries: 2 });

    await expect(menu.run(req("r1", ["1", "x"]))).resolves.toEqual({ message: "Bad amount", end: false });
    expect(storage.map.get("r1:__state")).toEqual({ retries: { amount: 1 } });

    await expect(menu.run(req("r1", ["1", "x", "y"]))).resolves.toEqual({ message: "Bad amount", end: false });
    expect(storage.map.get("r1:__state")).toEqual({ retries: { amount: 2 } });

    // A second navigator sharing the store (another server) sees the same count.
    const other = build({ storage, max_retries: 2 });
    await expect(other.run(req("r1", ["1", "x", "y", "z"]))).resolves.toEqual({ message: "Sorry", end: true });
  });

  test.each([0, 1, 2, 3])("max_retries: %i gives exactly that many retry prompts", async (max) => {
    const menu = build({ max_retries: max });
    const path = ["1"];
    const replies: string[] = [];
    for (let i = 0; i < max + 2; i++) {
      path.push("x");
      replies.push((await menu.run(req(`m${max}`, [...path]))).message);
    }
    expect(replies).toEqual([
      ...Array(max).fill("Bad amount"),
      "Sorry",
      "Sorry",
    ]);
  });

  test("number patterns match string input", async () => {
    const menu = new UssdNavigator<UssdResponse>();
    menu.startMenu({
      run: () => ({ message: "Start", end: false }),
      next: [{ pattern: 1, action: "one" }],
    });
    menu.addMenu("one", { run: () => ({ message: "One", end: true }) });
    await expect(menu.run(req("n1", ["1"]))).resolves.toEqual({ message: "One", end: true });
  });

  test("dropSession removes session data and retry counts", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage });
    await menu.run(req("d1", ["1"]));
    await menu.run(req("d1", ["1", "x"]));
    expect(storage.map.has("d1")).toBe(true);
    expect(storage.map.has("d1:__state")).toBe(true);

    const m2 = new UssdNavigator<UssdResponse>({ storage });
    m2.startMenu({
      run: async () => {
        await m2.dropSession();
        return { message: "Bye", end: true };
      },
    });
    await m2.run(req("d1", []));
    expect(storage.map.has("d1")).toBe(false);
    expect(storage.map.has("d1:__state")).toBe(false);
  });

  test("drop_session_on_end drops the session after an end: true reply", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage, drop_session_on_end: true });
    await menu.run(req("e1", ["1"]));
    expect(storage.map.has("e1")).toBe(true);
    await expect(menu.run(req("e1", ["1", "100"]))).resolves.toEqual({ message: "Done", end: true });
    expect(storage.map.has("e1")).toBe(false);
  });

  test("sessions are kept after end: true by default", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage });
    await menu.run(req("e2", ["1"]));
    await menu.run(req("e2", ["1", "100"]));
    expect(storage.map.has("e2")).toBe(true);
  });

  test("session_ttl is passed to storage.set", async () => {
    const storage = new SpyStorage();
    const menu = build({ storage, session_ttl: 120 });
    await menu.run(req("t1", ["1"]));
    expect(storage.ttls.length).toBeGreaterThan(0);
    expect(storage.ttls.every((t) => t === 120)).toBe(true);
  });

  test("session_ttl expires keys in the built-in memory storage", async () => {
    const menu = build({ session_ttl: 0.05 });
    await menu.run(req("t2", ["1"]));
    await expect(menu.get("t2")).resolves.toMatchObject({ visited: true });
    await sleep(80);
    await expect(menu.get("t2")).resolves.toBeNull();
  });

  test("run() does not mutate the caller's path array", async () => {
    const menu = new UssdNavigator<UssdResponse>();
    menu.startMenu({
      run: () => ({ message: "Start", end: false }),
      next: [{ pattern: "", action: menu.start_menu }],
    });
    const path: string[] = [];
    await menu.run(req("p1", path));
    expect(path).toEqual([]);
  });
});
