import { AsyncLocalStorage } from "node:async_hooks";
import {
  CoreMenuResponse,
  LoggerPayload,
  MenuNextAction,
  MenuNextPattern,
  MenuOptions,
  RedisOptions,
  RunArgs,
  SessionStorage,
} from "../types";
import UssdMenu from "./menu";
import SessionManager from "../session-manager";

type UssdNavigatorOptions = {
  retry_message?: string;
  max_retries?: number;
  log?: (payload: LoggerPayload) => void;
  redis_config?: RedisOptions;
  /** Custom session store implementing SessionStorage. Takes precedence over redis_config. */
  storage?: SessionStorage;
  /** Session key expiry in seconds. */
  session_ttl?: number;
  /** Drop the session (data, history, retries) after a reply with `end: true`. Default false. */
  drop_session_on_end?: boolean;
};

/** Per-request state, isolated across concurrent requests via AsyncLocalStorage. */
type RequestContext = {
  phoneNumber: string;
  sessionID: string;
  serviceCode: string;
  input: string;
  /** Number of path inputs consumed so far while routing. */
  step: number;
  /** Navigation stack rebuilt from the path on every request. */
  history: string[];
  /** Internal per-session state persisted in storage. */
  state: InternalState;
};

/** Stored under `<sessionID>:__state`. */
type InternalState = {
  retries: Record<string, number>;
  /** Navigation history restarts after this many path inputs (set by clearNavigationHistory). */
  historyResetAt?: number;
};

class UssdNavigator<T> extends SessionManager {
  private menus: Map<string, UssdMenu<T>>;
  public start_menu = "__start__";
  public sorry_menu = "__sorry__";
  public end_menu = "__end__";

  private readonly ctx = new AsyncLocalStorage<RequestContext>();

  public defaultRetryMessage: string;

  private defaultMaxRetries: number = 3;

  private logger?: (payload: LoggerPayload) => void;

  private back_pattern: string = "0";

  private readonly dropSessionOnEnd: boolean;

  constructor(options?: UssdNavigatorOptions) {
    const {
      max_retries,
      log,
      retry_message,
      drop_session_on_end,
      ...session_options
    } = options || {};
    super({ ...session_options });
    this.menus = new Map();

    this.defaultRetryMessage =
      retry_message || "Invalid input. Please try again.";
    this.defaultMaxRetries = max_retries ?? 3;

    this.logger = log;
    this.dropSessionOnEnd = drop_session_on_end ?? false;
  }

  // Request-scoped accessors. These read from the current request's context,
  // so a single shared navigator is safe under concurrent requests.
  get input(): string {
    return this.ctx.getStore()?.input ?? "";
  }
  set input(value: string) {
    const store = this.ctx.getStore();
    if (store) store.input = value;
  }

  get sessionID(): string {
    return this.ctx.getStore()?.sessionID ?? "";
  }
  set sessionID(value: string) {
    const store = this.ctx.getStore();
    if (store) store.sessionID = value;
  }

  get serviceCode(): string {
    return this.ctx.getStore()?.serviceCode ?? "";
  }
  set serviceCode(value: string) {
    const store = this.ctx.getStore();
    if (store) store.serviceCode = value;
  }

  get phoneNumber(): string {
    return this.ctx.getStore()?.phoneNumber ?? "";
  }
  set phoneNumber(value: string) {
    const store = this.ctx.getStore();
    if (store) store.phoneNumber = value;
  }

  addMenu(name: string, options: MenuOptions<T>, enableBack: boolean = true) {
    if (this.menus.has(name)) {
      throw new Error(`Menu ${name} already exists`);
    }

    const originalNext = options.next || [];

    const enhancedNext = enableBack
      ? [
          ...originalNext,
          {
            pattern: this.back_pattern,
            action: () => this.goBack(),
          },
        ]
      : originalNext;

    const menu = new UssdMenu({
      name,
      ...options,
      next: enhancedNext,
    });

    this.menus.set(name, menu);

    return menu;
  }

  startMenu(options: MenuOptions<T>) {
    return this.addMenu(this.start_menu, { ...options }, false);
  }

  getRoute(args: RunArgs): Partial<RunArgs["path"]> {
    if (!args.path) {
      throw new Error("Navigation path is required");
    }

    // Copy so we never mutate the caller's array.
    return [...args.path];
  }

  matchPattern(pattern: MenuNextPattern, input: string): boolean {
    if (typeof pattern === "string" || typeof pattern === "number") {
      return input === String(pattern);
    } else if (pattern instanceof RegExp) {
      return typeof input === "string" && pattern.test(input);
    }
    return false;
  }

  private async resolveAction(action: string | MenuNextAction): Promise<string> {
    if (typeof action === "string") return action;
    if (typeof action === "function") return await action();
    throw new Error("Invalid action");
  }

  private async resolveRoute(
    path: Partial<RunArgs["path"]>,
  ): Promise<{ state: string; is_retry: boolean }> {
    const store = this.ctx.getStore()!;
    let current_state = this.start_menu;
    let is_retry = false;

    const startState = this.menus.get(this.start_menu);
    if (!startState) {
      throw new Error("Please add a start menu");
    }

    const startStateNext = startState.next ?? [];
    if (startStateNext.some((n) => n.pattern === "")) {
      path.unshift("");
    }

    store.history = [this.start_menu];
    store.step = 0;

    for (const p of path) {
      const currentstate = this.menus.get(current_state);
      store.input = p!;
      store.step++;

      if (!currentstate) {
        throw new Error("No state found");
      }

      const nextState = currentstate.next?.find((n) =>
        this.matchPattern(n.pattern, p!),
      );

      if (nextState) {
        current_state = await this.resolveAction(nextState.action);
        is_retry = false;
        this.recordVisit(current_state);
        continue;
      }

      if (currentstate.retriable && !this.isRetryLimitExceeded(currentstate.name)) {
        is_retry = true;
      } else {
        // Sorry is terminal: don't keep replaying later inputs against it.
        current_state = this.sorry_menu;
        is_retry = false;
        break;
      }
    }

    return { state: current_state, is_retry };
  }

  /**
   * Pushes the state reached after the current step onto the in-request
   * history. Back actions have already popped, so they land on the top of
   * the stack and are not pushed again.
   */
  private recordVisit(state: string) {
    const store = this.ctx.getStore()!;
    if (store.state.historyResetAt === store.step) {
      store.history = [state];
      return;
    }
    if (store.history[store.history.length - 1] !== state) {
      store.history.push(state);
    }
  }

  run(args: RunArgs): Promise<CoreMenuResponse> {
    const context: RequestContext = {
      phoneNumber: args.phoneNumber,
      sessionID: args.sessionID,
      serviceCode: args.serviceCode,
      input: "",
      step: 0,
      history: [],
      state: { retries: {} },
    };
    return this.ctx.run(context, () => this.runInternal(args));
  }

  private async runInternal(args: RunArgs): Promise<CoreMenuResponse> {
    const store = this.ctx.getStore()!;
    const saved = await this.get(this.stateKey());
    store.state = { ...saved, retries: saved?.retries || {} };

    const route = this.getRoute(args);
    const { state: nextState, is_retry } = await this.resolveRoute(route);

    const state = this.menus.get(nextState);

    if (!state) {
      this.log({
        menu: nextState,
        menu_category: null,
        input: this.input,
        sessionID: this.sessionID,
        serviceCode: this.serviceCode,
        phoneNumber: this.phoneNumber,
        message: "sorry",
        end: false,
      });
      throw new Error("No state found");
    }

    if (is_retry) {
      const message = state?.retry_message || this.defaultRetryMessage;

      this.log({
        menu: state.name,
        menu_category: state.category,
        input: this.input,
        sessionID: this.sessionID,
        serviceCode: this.serviceCode,
        phoneNumber: this.phoneNumber,
        message,
        end: false,
      });

      await this.incrementRetryCount(state.name);

      return { message, end: false };
    }

    const result = (await Promise.resolve(state.run())) as CoreMenuResponse & T;

    this.log({
      menu: state.name,
      menu_category: state.category,
      input: this.input,
      sessionID: this.sessionID,
      serviceCode: this.serviceCode,
      phoneNumber: this.phoneNumber,
      message: result.message,
      end: result.end,
    });

    if (this.dropSessionOnEnd && result?.end === true) {
      await this.dropSession();
    }

    return { ...result };
  }

  log(payload: LoggerPayload) {
    if (this.logger) {
      this.logger({ ...payload });
    }
  }

  async getSession(): Promise<any> {
    return this.get(this.sessionID);
  }

  async setSession(data: any): Promise<void> {
    return this.update(this.sessionID, data);
  }

  /** Drops session data and internal state (retry counts, history reset). */
  async dropSession(): Promise<void> {
    await Promise.all([this.drop(this.sessionID), this.drop(this.stateKey())]);
  }

  // Internal state lives in session storage (key `<sessionID>:__state`) so it
  // expires with session_ttl, is removed by dropSession, and works across servers.
  private stateKey(): string {
    return `${this.sessionID}:__state`;
  }

  private async saveState(patch: Partial<InternalState>): Promise<void> {
    const store = this.ctx.getStore()!;
    store.state = { ...store.state, ...patch };
    await this.set(this.stateKey(), store.state);
  }

  private async incrementRetryCount(menuName: string): Promise<number> {
    const store = this.ctx.getStore()!;
    const count = (store.state.retries[menuName] || 0) + 1;
    await this.saveState({ retries: { ...store.state.retries, [menuName]: count } });
    return count;
  }

  private isRetryLimitExceeded(menuName: string): boolean {
    const menu = this.menus.get(menuName);
    if (!menu) return false;

    const maxRetries = menu.max_retries ?? this.defaultMaxRetries;
    const count = this.ctx.getStore()?.state.retries[menuName] || 0;

    // max_retries = N allows N retry prompts; the next invalid input goes to sorry.
    return count >= maxRetries;
  }

  /**
   * Returns the previous menu and pops the current one from history.
   * Use as a `next` action, e.g. `{ pattern: "00", action: () => router.goBack() }`.
   * History is derived from the request path, so replaying a path always
   * gives the same result.
   */
  async goBack(): Promise<string> {
    const store = this.ctx.getStore();
    if (!store) return this.start_menu;
    store.history.pop();
    if (store.history.length === 0) store.history.push(this.start_menu);
    return store.history[store.history.length - 1];
  }

  /**
   * Starts navigation history afresh from the current point, so "back" won't
   * go past it. Persists across later requests in the same session.
   */
  async clearNavigationHistory(): Promise<void> {
    const store = this.ctx.getStore();
    if (!store) return;
    const current = store.history[store.history.length - 1] ?? this.start_menu;
    store.history = [current];
    if (store.state.historyResetAt !== store.step) {
      await this.saveState({ historyResetAt: store.step });
    }
  }

  /** Menus visited in the current request's path, oldest first, ending with the current menu. */
  async getNavigationHistory(): Promise<string[]> {
    return [...(this.ctx.getStore()?.history ?? [])];
  }
}

export default UssdNavigator;
export type { UssdNavigator };
