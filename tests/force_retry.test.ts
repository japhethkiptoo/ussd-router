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
            if (router.input !== "4321") {
              return "invalid_pin";
            }
            return "dashbaord";
          },
        },
      ],
    });

    router.addMenu("invalid_pin", {
      run: () => {
        return {
          message: "Wrong PIN, please try again?",
          end: false,
        };
      },
      next: [
        {
          pattern: /^\d{4}$/,
          action: () => {
            if (router.input !== "4321") {
              return "invalid_pin";
            }
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

  it("Wrong PIN routes to invalid_pin", async () => {
    await expect(
      router.run({
        sessionID: "345437",
        serviceCode: "*222#",
        phoneNumber: "254724765149",
        input: "",
        path: ["1234"],
      }),
    ).resolves.toEqual({ message: "Wrong PIN, please try again?", end: false });
  });

  it("Correct PIN after a wrong one reaches the dashboard", async () => {
    await expect(
      router.run({
        sessionID: "345438",
        serviceCode: "*222#",
        phoneNumber: "254724765149",
        input: "",
        path: ["1234", "4321"],
      }),
    ).resolves.toEqual({ message: "Dashboard", end: true });
  });
});
