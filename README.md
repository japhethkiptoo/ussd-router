# ussd-router

The USSD Router is a JavaScript-based service for handling USSD (Unstructured Supplementary Service Data) requests. USSD is a protocol used for communicating with mobile devices, typically for services such as mobile banking, mobile money, and other interactive services.

Key Features:

Menu-based Navigation: The service uses a menu-based navigation system, where users can interact with the service by selecting options from a menu.
Session Management: The service has a session management system, which allows it to store and retrieve user session data.
Logger: The service has a logger component, which logs user interactions and other events.
Error Handling: The service has error handling mechanisms in place, which handle errors and exceptions that may occur during user interactions.

# Installation

```bash
# Basic installation without Redis
npm install ussd-navigator

# Installation with Redis support
npm install ussd-navigator redis
```

# Usage

```typescript
import UssdNavigator from "ussd-navigator";

type UssdResponse = {
  message: string;
  end: boolean;
};

const router = new UssdNavigator<UssdResponse>();

//start menu - important!
router.startMenu({
  run: () => {
    return {
      message: "Hello, welcome to our service! 1) Sign up 2) Login 3) Logout",
      end: false,
    };
  },
  next: [
    { pattern: "1", action: "sign_up" },
    { pattern: "2", action: () => "login" },
    { pattern: "3", action: async () => {
      return Promise.resolve("logout");
    } },
  ],
});

//signup menu
router.addMenu("signup", {
  run: () => {
    return {
      message: "Welcome to our signup page!",
      end: false,
    };
  },
  next: [
    { pattern: "1", action: ...},
    { pattern: "2", action: ...},
  ],
});

//login menu
router.addMenu("login", {
  run: () => {
    return {
      message: "Welcome to our login page!",
      end: true,
    };
  },

});

```
