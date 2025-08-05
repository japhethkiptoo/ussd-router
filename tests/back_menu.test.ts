import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Menu Back Navigation", () => {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>({
    log: (l) => {
      console.log(l);
    },
  });

  beforeEach(() => {
    router.startMenu({
      run: () => {
        return {
          message:
            "Hi, Welcome to OMIG Wealth \n 1) Invest \n 2) Withdraw Funds",
          end: false,
        };
      },
      next: [
        {
          pattern: "1",
          action: "invest",
        },
      ],
    });

    router.addMenu("invest", {
      run: () => {
        return {
          message: `Enter Amount to Invest. \n 0) Back`,
          end: false,
        };
      },
      next: [{ pattern: "100", action: "payment" }],
    });

    router.addMenu(
      "payment",
      {
        run: () => {
          return {
            message: "Nice, it was a success",
            end: true,
          };
        },
      },
      false,
    );
  });

  test("Back to start Menu", async () => {
    await expect(
      router.run({
        sessionID: "345437",
        serviceCode: "*222#",
        phoneNumber: "254724765149",
        input: "",
        path: ["1", "100", "0"],
      }),
    ).resolves.toEqual({
      message: "Hi, Welcome to OMIG Wealth \n 1) Invest \n 2) Withdraw Funds",
      end: false,
    });
  });
});
