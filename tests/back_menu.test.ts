import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

const START = "Hi, Welcome to OMIG Wealth \n 1) Invest \n 2) Withdraw Funds";
const INVEST = "Enter Amount to Invest. \n 0) Back";
const CONFIRM = "Confirm 100? \n 1) Yes \n 2) Change \n 0) Back";
const CHANGE = "Enter new amount \n 0) Back";

function buildRouter() {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>();

  router.startMenu({
    run: () => ({ message: START, end: false }),
    next: [
      { pattern: "1", action: "invest" },
      { pattern: "2", action: "withdraw" },
    ],
  });

  router.addMenu("invest", {
    run: () => ({ message: INVEST, end: false }),
    next: [{ pattern: "100", action: "confirm" }],
  });

  router.addMenu("confirm", {
    run: () => ({ message: CONFIRM, end: false }),
    next: [
      { pattern: "1", action: "payment" },
      { pattern: "2", action: "change" },
    ],
  });

  router.addMenu("change", {
    run: () => ({ message: CHANGE, end: false }),
    next: [{ pattern: /^[1-9]\d*$/, action: "confirm" }],
  });

  router.addMenu(
    "payment",
    { run: () => ({ message: "Nice, it was a success", end: true }) },
    false,
  );

  // Custom back key via router.goBack(), and clearing history
  router.addMenu(
    "withdraw",
    {
      run: async () => {
        await router.clearNavigationHistory();
        return { message: "Withdraw \n 1) Mpesa \n 00) Back", end: false };
      },
      next: [
        { pattern: "1", action: "mpesa" },
        { pattern: "00", action: () => router.goBack() },
      ],
    },
    false,
  );

  router.addMenu("mpesa", {
    run: async () => ({
      message: `Mpesa | history=${(await router.getNavigationHistory()).join(">")}`,
      end: false,
    }),
  });

  return router;
}

// Each USSD request carries the full path so far, like a real gateway.
const runner = (router: IUssdNavigator<UssdRespone>, sessionID: string) => (path: string[]) =>
  router.run({
    sessionID,
    serviceCode: "*222#",
    phoneNumber: "254724765149",
    input: path[path.length - 1] ?? "",
    path,
  });

describe("Menu Back Navigation", () => {
  const router = buildRouter();

  test("Back from first menu returns to start", async () => {
    const step = runner(router, "back-1");
    await expect(step([])).resolves.toEqual({ message: START, end: false });
    await expect(step(["1"])).resolves.toEqual({ message: INVEST, end: false });
    await expect(step(["1", "0"])).resolves.toEqual({ message: START, end: false });
  });

  test("Back from a nested menu returns to the previous menu", async () => {
    const step = runner(router, "back-2");
    await expect(step(["1", "100"])).resolves.toEqual({ message: CONFIRM, end: false });
    await expect(step(["1", "100", "0"])).resolves.toEqual({ message: INVEST, end: false });
    await expect(step(["1", "100", "0", "0"])).resolves.toEqual({ message: START, end: false });
  });

  test("Works on the first request for a path, with no prior history", async () => {
    // e.g. a dialled shortcut like *222*1*100*0#, or a request landing on a new server
    const step = runner(buildRouter(), "back-3");
    await expect(step(["1", "100", "0"])).resolves.toEqual({ message: INVEST, end: false });
  });

  test("Back, forward, back again lands on the right menu", async () => {
    const step = runner(router, "back-4");
    // start > invest > confirm > change > (back) confirm > change > (back) confirm > (back) invest
    const paths = [
      [[], START],
      [["1"], INVEST],
      [["1", "100"], CONFIRM],
      [["1", "100", "2"], CHANGE],
      [["1", "100", "2", "0"], CONFIRM],
      [["1", "100", "2", "0", "2"], CHANGE],
      [["1", "100", "2", "0", "2", "0"], CONFIRM],
      [["1", "100", "2", "0", "2", "0", "0"], INVEST],
      [["1", "100", "2", "0", "2", "0", "0", "0"], START],
    ] as const;
    for (const [path, message] of paths) {
      await expect(step([...path])).resolves.toEqual({ message, end: false });
    }
  });

  test("Replaying the same path is deterministic", async () => {
    const step = runner(router, "back-5");
    const path = ["1", "100", "2", "0", "0"];
    for (let i = 0; i < 3; i++) {
      await expect(step(path)).resolves.toEqual({ message: INVEST, end: false });
    }
  });

  test("Revisiting a menu (change > confirm) does not duplicate history", async () => {
    const step = runner(router, "back-6");
    // history: start, invest, confirm, change, confirm -> back pops to change
    await expect(step(["1", "100", "2", "200", "0"])).resolves.toEqual({
      message: CHANGE,
      end: false,
    });
  });

  test("Routing does not write navigation history to the session", async () => {
    const step = runner(router, "back-7");
    await step(["1", "100", "0"]);
    await expect(router.get("back-7")).resolves.toBeNull();
  });

  test("Custom back key via goBack() and clearNavigationHistory()", async () => {
    const step = runner(router, "back-8");
    await expect(step(["2"])).resolves.toMatchObject({ message: expect.stringContaining("Withdraw") });
    await expect(step(["2", "1"])).resolves.toEqual({ message: "Mpesa | history=withdraw>mpesa", end: false });
    // withdraw cleared history, so "back" from mpesa stays at withdraw and 00 from withdraw goes to start
    await expect(step(["2", "1", "0"])).resolves.toMatchObject({ message: expect.stringContaining("Withdraw") });
    await expect(step(["2", "1", "0", "00"])).resolves.toEqual({ message: START, end: false });
  });
});
