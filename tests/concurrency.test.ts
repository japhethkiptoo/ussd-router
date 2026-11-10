import UssdNavigator from "../src";
import type { SessionStorage } from "../src";

type UssdResponse = { message: string; end: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(5 + Math.floor(Math.random() * 25));

// Slow stubbed "external service" keyed by phone number.
const fetchAccount = async (phone: string) => {
  await jitter();
  return { owner: `owner-${phone}` };
};

// Slow async store, to force interleaving at every storage call.
class SlowStorage implements SessionStorage {
  private map = new Map<string, string>();
  async get(key: string) {
    await jitter();
    const v = this.map.get(key);
    return v ? JSON.parse(v) : null;
  }
  async set(key: string, value: any) {
    await jitter();
    this.map.set(key, JSON.stringify(value));
  }
  async delete(key: string) {
    await jitter();
    this.map.delete(key);
  }
}

function buildRouter(options?: ConstructorParameters<typeof UssdNavigator>[0]) {
  const menu = new UssdNavigator<UssdResponse>(options);

  menu.startMenu({
    run: () => ({ message: "Welcome\n1) Balance", end: false }),
    next: [{ pattern: "1", action: "pin" }],
  });

  menu.addMenu("pin", {
    run: async () => {
      const account = await fetchAccount(menu.phoneNumber);
      await menu.setSession({ owner: account.owner });
      return { message: `PIN for ${account.owner}`, end: false };
    },
    next: [
      {
        pattern: /^\d{4}$/,
        action: async () => {
          await jitter();
          await menu.setSession({ pin: menu.input });
          return "result";
        },
      },
    ],
  });

  menu.addMenu("result", {
    run: async () => {
      await jitter();
      const session = await menu.getSession();
      return {
        message: [
          menu.sessionID,
          menu.phoneNumber,
          menu.serviceCode,
          menu.input,
          session?.owner,
          session?.pin,
        ].join("|"),
        end: true,
      };
    },
  });

  return menu;
}

describe.each([
  ["memory storage", undefined],
  ["custom slow storage", () => ({ storage: new SlowStorage() })],
])("Concurrency (%s)", (_name, makeOptions) => {
  test("30 overlapping sessions each get their own data", async () => {
    const menu = buildRouter(makeOptions ? makeOptions() : undefined);
    const N = 30;
    const users = Array.from({ length: N }, (_, i) => ({
      sessionID: `sess-${i}`,
      phoneNumber: `2547000000${String(i).padStart(2, "0")}`,
      serviceCode: `*${100 + i}#`,
      pin: String(1000 + i),
    }));

    const results = await Promise.all(
      users.map(async (u) => {
        const base = { sessionID: u.sessionID, phoneNumber: u.phoneNumber, serviceCode: u.serviceCode };
        await jitter();
        await menu.run({ ...base, input: "", path: [] });
        const pin = await menu.run({ ...base, input: "1", path: ["1"] });
        const final = await menu.run({ ...base, input: u.pin, path: ["1", u.pin] });
        return { u, pin, final };
      }),
    );

    for (const { u, pin, final } of results) {
      expect(pin).toEqual({ message: `PIN for owner-${u.phoneNumber}`, end: false });
      expect(final).toEqual({
        message: [u.sessionID, u.phoneNumber, u.serviceCode, u.pin, `owner-${u.phoneNumber}`, u.pin].join("|"),
        end: true,
      });
    }
  });
});
