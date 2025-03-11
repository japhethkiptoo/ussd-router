import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Menu Error-handling", () => {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>();

  beforeEach(() => {
    router.addMenu("start", {
      run: () => {
        return {
          message: "Hello",
          end: true,
        };
      },
    });
  });

  test("Must have a start menu", async () => {
    await expect(
      router.run({
        path: ["1"],
        input: "",
        sessionID: "",
        phoneNumber: "",
        serviceCode: "*280#",
      }),
    ).rejects.toThrow();
  });
});
