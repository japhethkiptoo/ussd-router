import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Menu Re-try Functionality", () => {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>();

  beforeAll(() => {
    router.startMenu({
      run: () => {
        return {
          message: "Hello",
          end: false,
        };
      },
      next: [{ pattern: "1", action: "amount_menu" }],
    });

    router.addMenu("amount_menu", {
      run: () => {
        return {
          message: "Enter Amount(min 100)",
          end: false,
        };
      },
      next: [{ pattern: "200", action: "amount.success" }],
      retry_message: `Invalid Amount, please Enter an Amount(min 100)`,
    });

    router.addMenu("amount.success", {
      run: () => {
        return {
          message: "Success",
          end: true,
        };
      },
    });
  });

  // test("Menu Client Response", async () => {
  //   await expect(
  //     router.run({
  //       sessionID: "345437",
  //       serviceCode: "*222#",
  //       phoneNumber: "254724765149",
  //       input: "",
  //       path: [],
  //     }),
  //   ).resolves.toEqual({ message: "Hello", end: false });
  // })

  // test("Amount Enter Menu", async () => {
  //   await expect(
  //     router.run({
  //       sessionID: "345437",
  //       serviceCode: "*222#",
  //       phoneNumber: "254724765149",
  //       input: "1",
  //       path: ["1"],
  //     }),
  //   ).resolves.toEqual({ message: "Enter Amount(min 100)", end: false });
  // });

  test("Retry Input", async () => {
    await expect(
      router.run({
        sessionID: "345437",
        serviceCode: "*222#",
        phoneNumber: "254724765149",
        input: "1",
        path: ["1", "100"],
      }),
    ).resolves.toEqual({ message: "Enter Amount(min 100)", end: false });
  });
});
