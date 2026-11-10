# ussd-navigator

A small, typed router for USSD apps in Node.js. You describe your menus and how user input moves between them. `ussd-navigator` works out which menu to show for each request and handles sessions, input validation and retries, back navigation and logging.

- Menus with string, number or regex input patterns
- Sync or async menus and actions (call your APIs and databases directly)
- Sessions in memory, Redis, or your own store, with optional expiry
- Retry prompts for invalid input, with a per-menu limit
- "0 = back" navigation that always returns to the previous menu
- Safe under concurrent requests with a single shared router
- Written in TypeScript

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How routing works](#how-routing-works)
- [Menus](#menus)
- [Patterns and actions](#patterns-and-actions)
- [Reading request data](#reading-request-data)
- [Invalid input, retries and the sorry menu](#invalid-input-retries-and-the-sorry-menu)
- [Sessions](#sessions)
- [Back navigation](#back-navigation)
- [Storage](#storage)
- [Concurrency](#concurrency)
- [Logging](#logging)
- [Errors](#errors)
- [API reference](#api-reference)
- [Changelog](#changelog)

## Installation

```bash
npm install ussd-navigator

# with Redis session storage
npm install ussd-navigator redis
```

Requires Node.js 16.4 or later. `redis` (v4) is an optional peer dependency. You only need it if you use `redis_config`.

## Quick start

A complete app with an [Africa's Talking](https://developers.africastalking.com/docs/ussd/overview)-style gateway and Express:

```typescript
import express from "express";
import UssdNavigator from "ussd-navigator";

type UssdResponse = { message: string; end: boolean };

const router = new UssdNavigator<UssdResponse>();

router.startMenu({
  run: () => ({
    message: "Welcome to MyBank\n1. Check balance\n2. Send money",
    end: false,
  }),
  next: [
    { pattern: "1", action: "balance" },
    { pattern: "2", action: "send.amount" },
  ],
});

router.addMenu("balance", {
  run: async () => {
    const balance = await getBalance(router.phoneNumber); // your own function
    return { message: `Your balance is KES ${balance}`, end: true };
  },
});

router.addMenu("send.amount", {
  run: () => ({ message: "Enter amount\n0. Back", end: false }),
  next: [
    {
      pattern: /^[1-9]\d*$/,
      action: async () => {
        await router.setSession({ amount: Number(router.input) });
        return "send.confirm";
      },
    },
  ],
  retry_message: "Invalid amount. Enter a whole number\n0. Back",
});

router.addMenu("send.confirm", {
  run: async () => {
    const { amount } = await router.getSession();
    return { message: `Send KES ${amount}?\n1. Confirm\n0. Back`, end: false };
  },
  next: [{ pattern: "1", action: "send.done" }],
});

router.addMenu("send.done", {
  run: () => ({ message: "Money sent!", end: true }),
});

// Shown when a user runs out of retries. Always define it.
router.addMenu(router.sorry_menu, {
  run: () => ({ message: "Sorry, too many invalid attempts.", end: true }),
});

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post("/ussd", async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  const path: string[] = text ? text.split("*") : [];

  try {
    const { message, end } = await router.run({
      sessionID: sessionId,
      serviceCode,
      phoneNumber,
      path,
      input: path[path.length - 1] ?? "",
    });
    res.type("text/plain").send(`${end ? "END" : "CON"} ${message}`);
  } catch (err) {
    console.error(err);
    res.type("text/plain").send("END Something went wrong. Please try again.");
  }
});

app.listen(3000);
```

Create the router and register its menus **once** at startup, not inside the request handler.

## How routing works

USSD gateways send the user's **whole input history** on every request. For example, Africa's Talking sends `text: "2*500*1"`. Split it into an array and pass it as `path`:

| Request | `text` | `path` | Menu shown |
|---|---|---|---|
| 1 | `""` | `[]` | start menu |
| 2 | `"2"` | `["2"]` | `send.amount` |
| 3 | `"2*500"` | `["2", "500"]` | `send.confirm` |
| 4 | `"2*500*1"` | `["2", "500", "1"]` | `send.done` |

On each request the router starts at the start menu and replays `path` one input at a time. At each step it finds the first `next` entry whose pattern matches the input and moves to the menu its action names. It then calls `run()` on the menu where it ends up and returns that result.

Only `path` is used for routing. The `input` field of `run()` is accepted for compatibility and ignored. Pass the last input or `""`.

Because `next` actions run during every replay, keep them quick and free of side effects you don't want repeated. Do slow or one-time work (API calls, payments) in a menu's `run`, which only runs for the menu actually shown. Writing to the session from an action is fine, because the same path always writes the same values.

## Menus

```typescript
router.startMenu(options);                     // required, exactly one
router.addMenu(name, options, enableBack = true);
```

| Option | Type | Default | Description |
|---|---|---|---|
| `run` | `() => T \| Promise<T>` | required | Builds the reply. Must return an object, normally `{ message, end }`. |
| `next` | `{ pattern, action }[]` | `[]` | Where each input goes from this menu. See [Patterns and actions](#patterns-and-actions). |
| `retriable` | `boolean` | `true` | Whether invalid input re-prompts (`true`) or goes straight to the sorry menu (`false`). |
| `retry_message` | `string` | router's `retry_message` | Message shown when input doesn't match any pattern. |
| `max_retries` | `number` | router's `max_retries` (3) | Number of retry prompts allowed on this menu per session. |
| `category` | `string` | `"default"` | Free-form label passed to the logger. |

The third argument of `addMenu` turns off the built-in "0 = back" for that menu. The start menu never has it.

Menu names must be unique. Registering the same name twice throws. The router's built-in menu names are `router.start_menu` (`"__start__"`) and `router.sorry_menu` (`"__sorry__"`).

Whatever `run` returns is passed back from `router.run()`, so you can add your own fields:

```typescript
type Reply = { message: string; end: boolean; analyticsTag?: string };
const router = new UssdNavigator<Reply>();
```

## Patterns and actions

A `pattern` is matched against one input:

| Pattern | Matches |
|---|---|
| `"1"` | exactly `"1"` |
| `1` | exactly `"1"` (numbers are compared as strings) |
| `/^\d{4}$/` | any input the regex accepts |
| `""` (start menu only) | see below |

Entries are checked in order and the first match wins. Your own patterns are checked **before** the built-in back (`"0"`). So a pattern like `/^\d+$/` also catches `"0"` and back stops working on that menu. Use `/^[1-9]\d*$/` for amounts on menus with back.

An `action` says which menu to go to next:

```typescript
{ pattern: "1", action: "balance" }                                   // a menu name
{ pattern: /^\d{4}$/, action: () => router.input === "1234" ? "home" : "wrong_pin" }
{ pattern: /^\d+$/, action: async () => {                              // async is fine
    await router.setSession({ amount: router.input });
    return "confirm";
} }
```

If an action returns a name that isn't registered, `run()` rejects with `No state found`.

**The `""` pattern.** If the start menu has a `next` entry with pattern `""`, the router puts an extra `""` input at the front of every path. So the user moves past the start menu straight away, even on the first request. Use this to make the start menu a dispatcher:

```typescript
router.startMenu({
  run: () => ({ message: "", end: true }), // never shown
  next: [
    {
      pattern: "",
      action: async () => ((await isRegistered(router.phoneNumber)) ? "home" : "register"),
    },
  ],
});
```

## Reading request data

Inside any `run` or `action`, these properties hold the **current** request's values:

| Property | Value |
|---|---|
| `router.input` | The input being handled: the last input in `run`, the matched input in an `action` |
| `router.phoneNumber` | From `run()` |
| `router.sessionID` | From `run()` |
| `router.serviceCode` | From `run()` |

They're safe with concurrent requests (see [Concurrency](#concurrency)). Outside a request they return `""`.

## Invalid input, retries and the sorry menu

When an input matches no pattern on a menu:

- **`retriable: true`** (default): the user stays on the menu and sees its `retry_message`. The menu's `run` is **not** called. Each retry prompt counts against `max_retries`. After `max_retries` prompts, the next invalid input goes to the sorry menu.
- **`retriable: false`**: the user goes straight to the sorry menu.

```typescript
router.addMenu("pin", {
  run: () => ({ message: "Enter your 4-digit PIN", end: false }),
  next: [{ pattern: /^\d{4}$/, action: "home" }],
  retry_message: "PIN must be 4 digits. Try again",
  max_retries: 2, // two retry prompts, then sorry
});

router.addMenu(router.sorry_menu, {
  run: () => ({ message: "Too many invalid attempts. Goodbye.", end: true }),
});
```

**Always register `router.sorry_menu`.** Without it, a user who runs out of retries (or enters invalid input on a non-retriable menu) makes `run()` reject with `No state found`.

Retry counts are per menu and per session. They are not reset by a later valid input. They're kept in session storage, so they work across servers and are cleared by `dropSession()` and `session_ttl`.

## Sessions

Each session is keyed by `sessionID` and stored in the configured [storage](#storage).

```typescript
await router.setSession({ amount: 500 });  // shallow-merges into existing data
const session = await router.getSession(); // { amount: 500, ... } or null
await router.dropSession();                // deletes session data and retry counts
```

Call these inside `run` or an `action`. They use the current request's `sessionID`.

Session data stays until it is dropped or expires. To clean up automatically:

```typescript
new UssdNavigator({
  session_ttl: 300,          // expire session keys 5 minutes after the last write
  drop_session_on_end: true, // drop the session after any reply with end: true
});
```

## Back navigation

Every menu added with `addMenu` accepts `"0"` to go back to the previous menu, unless you pass `false` as the third argument. Remember to show "0. Back" in your message.

History is rebuilt from `path` on every request, nothing is stored. So back always returns to the menu the user actually came from, even after going back and forward several times. It works the same on any server.

```typescript
// Custom back key
router.addMenu(
  "withdraw",
  {
    run: () => ({ message: "1. M-Pesa\n00. Back", end: false }),
    next: [
      { pattern: "1", action: "mpesa" },
      { pattern: "00", action: () => router.goBack() },
    ],
  },
  false, // turn off the built-in "0"
);

// Inside run/action:
await router.getNavigationHistory();   // e.g. ["__start__", "send.amount", "send.confirm"]
await router.clearNavigationHistory(); // "back" won't go past the current menu (for the rest of the session)
```

Going back from the first menu after the start menu returns to the start menu.

## Storage

By default sessions live in memory. That's fine for development or a single process, but sessions are lost on restart and aren't shared between servers. Use Redis or your own store in production.

### Redis

```typescript
new UssdNavigator({ redis_config: { url: "redis://user:pass@localhost:6379/0" } });

// or build the URL from parts
new UssdNavigator({
  redis_config: { host: "localhost", port: 6379, username: "user", password: "pass", db: 0, tls: false },
});

// or reuse an existing node-redis v4 client
new UssdNavigator({ redis_config: { client: myRedisClient } });
```

| Option | Description |
|---|---|
| `url` | Full connection URL. Must start with `redis://` or `rediss://` (TLS). Overrides the parts below. |
| `host`, `port` | Default `127.0.0.1`, `6379`. |
| `username`, `password` | Optional. URL-encoded for you. |
| `db` | Database number, default `0`. |
| `tls` | Use `rediss://`. |
| `client` | An existing node-redis client. If it isn't connected yet, the router connects it. You handle its `error` events. |
| `session_ttl` | Same as the top-level `session_ttl`. |

The router connects on first use and shares one connection between all requests.

### Custom storage

Pass any object that implements `SessionStorage`:

```typescript
import UssdNavigator from "ussd-navigator";
import type { SessionStorage } from "ussd-navigator";

class MyStore implements SessionStorage {
  async get(key: string): Promise<any | null> { /* return stored value or null */ }
  async set(key: string, value: any, ttl?: number): Promise<void> { /* ttl in seconds, set when session_ttl is configured */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

new UssdNavigator({ storage: new MyStore() });
```

Values are plain JSON-serialisable objects. Besides the `<sessionID>` key for session data, the router stores internal state (retry counts) under `<sessionID>:__state`.

## Concurrency

Create **one** router and share it across all requests. Each `run()` call gets its own request context (using Node's `AsyncLocalStorage`). So `router.input`, `router.sessionID`, `router.getSession()` and the rest always refer to the current request, even across `await`s and when many requests overlap. There's no need to create a router per request.

## Logging

```typescript
new UssdNavigator({
  log: (entry) => logger.info(entry),
});
```

`log` is called once for each request that gets a reply, with:

```typescript
{
  menu: string;              // menu shown
  menu_category: string | null | undefined;
  input: string;             // last input
  sessionID: string;
  serviceCode: string;
  phoneNumber: string;
  message: string;           // reply message (or retry message)
  end: boolean;
}
```

## Errors

`router.run()` returns a promise that rejects with:

| Error | Cause |
|---|---|
| `Please add a start menu` | `startMenu()` was never called |
| `No state found` | An action returned an unknown menu name, or `sorry_menu` is needed but not registered |
| `Navigation path is required` | `path` missing from `run()` arguments |
| any error thrown by your code | Errors from `run` and `action` functions, and storage errors, are passed through |

`addMenu` throws `Menu <name> already exists` for duplicate names. Creating a router with `redis_config` throws `Redis is not available` if the `redis` package isn't installed, or `Invalid redis url` if `url` doesn't start with `redis://` or `rediss://`.

Always catch errors from `run()` and reply with an `END` message, as in the [quick start](#quick-start).

## API reference

### `new UssdNavigator<T>(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `retry_message` | `string` | `"Invalid input. Please try again."` | Default retry message |
| `max_retries` | `number` | `3` | Default retry prompts per menu |
| `log` | `(entry: LoggerPayload) => void` | none | Called after each request |
| `redis_config` | `RedisOptions` | none | Use Redis storage |
| `storage` | `SessionStorage` | in-memory | Custom storage (takes priority over `redis_config`) |
| `session_ttl` | `number` (seconds) | none | Expire session keys |
| `drop_session_on_end` | `boolean` | `false` | Drop the session after a reply with `end: true` |

### Methods and properties

| Member | Description |
|---|---|
| `startMenu(options)` | Register the start menu |
| `addMenu(name, options, enableBack?)` | Register a menu |
| `run({ sessionID, serviceCode, phoneNumber, path, input })` | Handle a request. Resolves to the shown menu's `run` result |
| `getSession()` / `setSession(data)` / `dropSession()` | Current session's data |
| `goBack()` | Use as an action: go to the previous menu |
| `getNavigationHistory()` / `clearNavigationHistory()` | Current request's navigation history |
| `input`, `phoneNumber`, `sessionID`, `serviceCode` | Current request's values |
| `start_menu`, `sorry_menu` | Built-in menu names |

### Exports

```typescript
import UssdNavigator from "ussd-navigator";
import type {
  UssdNavigator as UssdNavigatorType,
  SessionStorage,
  RedisOptions,
  RunArgs,
  MenuOptions,
  MenuNext,
  CoreMenuResponse,
  LoggerPayload,
} from "ussd-navigator";
```

## Changelog

### 1.4.0

**New**

- One shared router is now safe under concurrent requests. Request data is kept per request with `AsyncLocalStorage`.
- `storage` option for custom session stores.
- `session_ttl` option: session keys expire (Redis uses `SET … EX`).
- `drop_session_on_end` option.
- `redis_config` accepts `url`, `tls`, `db` and `client`.
- Types (`SessionStorage`, `RedisOptions`, …) are exported from the package entry.

**Fixed**

- Redis: connection URL now always includes the scheme (no more `Invalid protocol`). Concurrent requests share one connection (no more `Socket already opened`). A Redis error no longer crashes the process.
- Back navigation always returns to the previous menu, including after going back and forward. Previously it often returned to the start menu.
- Number patterns (`pattern: 1`) now match.
- Once a user reaches the sorry menu, later inputs no longer turn into retry prompts on it.
- Retry counts are kept in session storage instead of an in-memory map that grew forever and wasn't shared between servers.
- `run()` no longer changes the `path` array you pass in.

**Upgrade notes**

- `max_retries: N` now allows exactly N retry prompts. Before, it allowed N + 1. To keep the old behaviour, add 1. `max_retries: 0` now means no retries (it was treated as 3).
- Navigation history is no longer written into session data. If you read `getSession().navigationHistory`, use `getNavigationHistory()` instead. It is only available inside a request.
- Requires Node.js 16.4 or later.
