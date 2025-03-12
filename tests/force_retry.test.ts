import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Force Retry", () => {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>();

  beforeAll(() => {
    router.startMenu({
      run: () => {
        return {
          message: "Enter PIN",
          end: false,
        };
      },
      retriable: true,
      next: [
        {
          pattern: /^\d{4}$/,
          action: () => {
            return "dashbaord";
          },
        },
      ],
    });

    router.addMenu(router.sorry_menu, {
      run: () => ({ message: "Sorry", end: true }),
    });

    router.addMenu("dashbaord", {
      run: () => ({ message: "Dashboard", end: true }),
    });
  });

  it("Menu force retry", async () => {
    await expect(
      router.run({
        sessionID: "345437",
        serviceCode: "*222#",
        phoneNumber: "254724765149",
        input: "",
        path: ["123"],
      }),
    ).resolves.toEqual({ message: "Sorry", end: true });
  });
});
