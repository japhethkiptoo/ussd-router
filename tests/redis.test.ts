import UssdNavigator from "../src";
import type { UssdNavigator as IUssdNavigator } from "../src/ussd-navigator";

type UssdRespone = {
  message: string;
  end: boolean;
};

describe("Redis integration", () => {
  const router: IUssdNavigator<UssdRespone> = new UssdNavigator<UssdRespone>({
    redis_config: {
      host: "",
      port: "3306",
      username: "blaaa",
      password: "blaaa",
    },
  });
});
