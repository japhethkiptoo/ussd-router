import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Redis integration", () => {
  let router: IUssdNavigator<UssdRespone>;

  beforeAll(() => {
    router = new UssdNavigator<UssdRespone>({
      redis_config: {
        host: "0.0.0.0",
        port: "6379",
        username: "",
        password: "",
      },
    });
  });

  test("Redis is configured", () => {
    // expect(router.getSession()).toBeTruthy();
  });
});
