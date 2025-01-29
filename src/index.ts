import UssdNavigator from "./ussd-navigator";

const menu = new UssdNavigator();

menu.startMenu({
  run: () => {},
  next: [
    {
      pattern: "",
      action: () => {
        return "action";
      },
    },
  ],
});

const result = menu.run({
  path: ["0"],
  input: "0",
  sessionID: "",
  serviceCode: "",
  phoneNumber: "",
});

console.log(result);
