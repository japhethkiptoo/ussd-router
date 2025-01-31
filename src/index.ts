import UssdNavigator from "./ussd-navigator";

const menu = new UssdNavigator<{ message: string }>();

menu.startMenu({
  run: () => {},
  next: [
    {
      pattern: "0",
      action: () => {
        console.log("input", menu.input);
        return "action";
      },
    },
  ],
});

menu.addMenu("action", {
  run: () => {
    return {
      message: "blaaa",
    };
  },
  next: [
    {
      pattern: "1",
      action: () => {
        console.log("Input", menu.input);
        return "blaas";
      },
    },
  ],
});

menu.addMenu("blaas", {
  run: () => {
    console.log("Input", menu.input);
    return {
      message: "blaaas",
    };
  },
  next: [],
});

(async () => {
  const result = await menu.run({
    path: ["1"],
    input: "0",
    sessionID: "",
    serviceCode: "",
    phoneNumber: "",
  });

  console.log(result);
})();
