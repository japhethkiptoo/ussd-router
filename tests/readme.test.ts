// Keeps the README examples honest: these mirror the README code samples.
import UssdNavigator from "../src";

type UssdResponse = { message: string; end: boolean };

const getBalance = async (_phone: string) => 1200;

function quickStartRouter() {
  const router = new UssdNavigator<UssdResponse>();

  router.startMenu({
    run: () => ({ message: "Welcome to MyBank\n1. Check balance\n2. Send money", end: false }),
    next: [
      { pattern: "1", action: "balance" },
      { pattern: "2", action: "send.amount" },
    ],
  });

  router.addMenu("balance", {
    run: async () => {
      const balance = await getBalance(router.phoneNumber);
      return { message: `Your balance is KES ${balance}`, end: true };
    },
  });

  router.addMenu("send.amount", {
    run: () => ({ message: "Enter amount\n0. Back", end: false }),
    next: [
      {
        pattern: /^[1-9]\d*$/,
        action: async () => {
          await router.setSession({ amount: Number(router.input) });
          return "send.confirm";
        },
      },
    ],
    retry_message: "Invalid amount. Enter a whole number\n0. Back",
  });

  router.addMenu("send.confirm", {
    run: async () => {
      const { amount } = await router.getSession();
      return { message: `Send KES ${amount}?\n1. Confirm\n0. Back`, end: false };
    },
    next: [{ pattern: "1", action: "send.done" }],
  });

  router.addMenu("send.done", { run: () => ({ message: "Money sent!", end: true }) });

  router.addMenu(router.sorry_menu, {
    run: () => ({ message: "Sorry, too many invalid attempts.", end: true }),
  });

  // Body of the README's Express handler
  const handle = async (body: { sessionId: string; serviceCode: string; phoneNumber: string; text: string }) => {
    const { sessionId, serviceCode, phoneNumber, text } = body;
    const path: string[] = text ? text.split("*") : [];
    try {
      const { message, end } = await router.run({
        sessionID: sessionId,
        serviceCode,
        phoneNumber,
        path,
        input: path[path.length - 1] ?? "",
      });
      return `${end ? "END" : "CON"} ${message}`;
    } catch {
      return "END Something went wrong. Please try again.";
    }
  };

  return handle;
}

const gw = (sessionId: string, text: string) => ({
  sessionId,
  serviceCode: "*384#",
  phoneNumber: "+254700000001",
  text,
});

describe("README quick start", () => {
  const handle = quickStartRouter();

  test("routing table walkthrough", async () => {
    await expect(handle(gw("q1", ""))).resolves.toBe("CON Welcome to MyBank\n1. Check balance\n2. Send money");
    await expect(handle(gw("q1", "2"))).resolves.toBe("CON Enter amount\n0. Back");
    await expect(handle(gw("q1", "2*500"))).resolves.toBe("CON Send KES 500?\n1. Confirm\n0. Back");
    await expect(handle(gw("q1", "2*500*1"))).resolves.toBe("END Money sent!");
  });

  test("balance", async () => {
    await expect(handle(gw("q2", "1"))).resolves.toBe("END Your balance is KES 1200");
  });

  test("back from confirm and from amount", async () => {
    await expect(handle(gw("q3", "2*500*0"))).resolves.toBe("CON Enter amount\n0. Back");
    await expect(handle(gw("q3", "2*500*0*0"))).resolves.toMatch(/^CON Welcome/);
  });

  test("invalid amounts: 3 retry prompts, then sorry", async () => {
    const replies = [];
    for (const text of ["2*abc", "2*abc*x", "2*abc*x*y", "2*abc*x*y*z"]) {
      replies.push(await handle(gw("q4", text)));
    }
    expect(replies).toEqual([
      "CON Invalid amount. Enter a whole number\n0. Back",
      "CON Invalid amount. Enter a whole number\n0. Back",
      "CON Invalid amount. Enter a whole number\n0. Back",
      "END Sorry, too many invalid attempts.",
    ]);
  });
});

describe("README dispatcher (\"\" pattern)", () => {
  test("start menu routes straight past itself", async () => {
    const registered = new Set(["+254700000001"]);
    const isRegistered = async (p: string) => registered.has(p);
    const router = new UssdNavigator<UssdResponse>();
    router.startMenu({
      run: () => ({ message: "", end: true }),
      next: [
        {
          pattern: "",
          action: async () => ((await isRegistered(router.phoneNumber)) ? "home" : "register"),
        },
      ],
    });
    router.addMenu("home", {
      run: () => ({ message: "Home\n1. Profile", end: false }),
      next: [{ pattern: "1", action: "profile" }],
    });
    router.addMenu("profile", { run: () => ({ message: "Profile", end: true }) });
    router.addMenu("register", { run: () => ({ message: "Register", end: true }) });

    const run = (phoneNumber: string, path: string[]) =>
      router.run({ sessionID: phoneNumber, serviceCode: "*1#", phoneNumber, path, input: "" });

    await expect(run("+254700000001", [])).resolves.toEqual({ message: "Home\n1. Profile", end: false });
    await expect(run("+254700000001", ["1"])).resolves.toEqual({ message: "Profile", end: true });
    await expect(run("+254799999999", [])).resolves.toEqual({ message: "Register", end: true });
  });
});

describe("README PIN example", () => {
  test("max_retries: 2 gives two retry prompts, then sorry", async () => {
    const router = new UssdNavigator<UssdResponse>();
    router.startMenu({
      run: () => ({ message: "Start", end: false }),
      next: [{ pattern: "1", action: "pin" }],
    });
    router.addMenu("pin", {
      run: () => ({ message: "Enter your 4-digit PIN", end: false }),
      next: [{ pattern: /^\d{4}$/, action: "home" }],
      retry_message: "PIN must be 4 digits. Try again",
      max_retries: 2,
    });
    router.addMenu("home", { run: () => ({ message: "Home", end: true }) });
    router.addMenu(router.sorry_menu, {
      run: () => ({ message: "Too many invalid attempts. Goodbye.", end: true }),
    });
    const path = ["1"];
    const replies: string[] = [];
    for (const input of ["1", "22", "333"]) {
      path.push(input);
      replies.push((await router.run({ sessionID: "pin", serviceCode: "", phoneNumber: "", path: [...path], input })).message);
    }
    expect(replies).toEqual([
      "PIN must be 4 digits. Try again",
      "PIN must be 4 digits. Try again",
      "Too many invalid attempts. Goodbye.",
    ]);
  });
});
