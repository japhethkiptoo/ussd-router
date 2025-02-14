import {
  CoreMenuResponse,
  MenuNextAction,
  MenuNextPattern,
  MenuOptions,
  RunArgs,
  UssdNavigatorOptions,
} from "../types";
import UssdMenu from "./menu";
import SessionManager from "../session-manager";

class UssdNavigator<T> extends SessionManager {
  private menus: Map<string, UssdMenu<T>>;
  public start_menu = "__start__";
  public sorry_menu = "__sorry__";
  public end_menu = "__end__";

  public input!: string;
  public sessionID!: string;
  public serviceCode!: string;
  public phoneNumber!: string;

  public defaultRetryMessage: string;

  private defaultMaxRetries: number = 3;

  private readonly sessionRetries: Map<string, number>;

  private logger?: (payload: any) => void;

  constructor(options?: UssdNavigatorOptions) {
    super();
    this.menus = new Map();
    this.sessionRetries = new Map();

    this.defaultRetryMessage =
      options?.retry_message || "Invalid input. Please try again.";
    this.defaultMaxRetries = options?.max_retries || 3;

    this.logger = options?.log;
  }

  addMenu(name: string, options: MenuOptions<T>) {
    if (this.menus.has(name)) {
      throw new Error(`Menu ${name} already exists`);
    }
    const menu = new UssdMenu({
      name,
      ...options,
    });
    this.menus.set(name, menu);

    return menu;
  }

  startMenu(options: MenuOptions<T>) {
    return this.addMenu(this.start_menu, { ...options });
  }

  getRoute(args: RunArgs): Partial<RunArgs["path"]> {
    if (!args.path) {
      throw new Error("Navigation path is required");
    }

    return args.path;
  }

  matchPattern(pattern: MenuNextPattern, input: string): boolean {
    if (typeof pattern === "string" || typeof pattern === "number") {
      return input === pattern;
    } else if (pattern instanceof RegExp) {
      return typeof input === "string" && pattern.test(input);
    }
    return false;
  }

  private resolveAction(action: string | MenuNextAction): Promise<string> {
    return new Promise(async (resolve, reject) => {
      if (typeof action === "string") {
        return resolve(action);
      } else if (typeof action === "function") {
        const result = action();
        return resolve(result instanceof Promise ? await result : result);
      }

      reject(new Error("Invalid action"));
    });
  }

  private handleRetry(state: string): Promise<{ state: string }> {
    return new Promise((resolve) => {
      return resolve({ state });
    });
  }

  private resolveRoute(
    path: Partial<RunArgs["path"]>
  ): Promise<{ state: string; is_retry: boolean }> {
    return new Promise(async (resolve, reject) => {
      let current_state = this.start_menu;
      let is_retry = false;

      const init = () => {
        const startState = this.menus.get(this.start_menu);

        if (!startState) {
          reject(new Error("Please add a start menu"));
          return;
        }

        const startStateNext = startState.next ?? [];
        const hasEmptyPattern = startStateNext.some((n) => n.pattern === "");
        if (hasEmptyPattern) {
          path.unshift("");
        }
      };

      init();

      for (const p of path) {
        const currentstate = this.menus.get(current_state);
        this.input = p!;

        if (!currentstate) {
          reject(new Error("No state found"));
          return;
        }

        const nextState = currentstate.next?.find((n) =>
          this.matchPattern(n.pattern, p!)
        );

        if (nextState) {
          current_state = await this.resolveAction(nextState.action);
          is_retry = false;
        }

        if (
          !nextState &&
          this.isRetryLimitExceeded(this.sessionID, currentstate.name)
        ) {
          const { state } = await this.handleRetry(current_state);
          current_state = state;
          is_retry = true;
        }

        if (
          !nextState &&
          !this.isRetryLimitExceeded(this.sessionID, currentstate.name)
        ) {
          current_state = this.sorry_menu;
          is_retry = false;
        }
      }

      resolve({ state: current_state, is_retry });
    });
  }

  run(args: RunArgs): Promise<CoreMenuResponse> {
    return new Promise(async (success, error) => {
      try {
      this.phoneNumber = args.phoneNumber;
      this.sessionID = args.sessionID;
      this.serviceCode = args.serviceCode;

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
        error(new Error("No state found"));
        return;
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

        this.incrementRetryCount(this.sessionID, state.name);

        success({
          message,
          end: false,
        });

        return;
      }

      const result = (await Promise.resolve(state.run())) as CoreMenuResponse &
        T;

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

      success({ ...result });
      return;
      } catch(e) {
      error(e)
      }
    });
  }

  log(payload: any) {
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

  async dropSession(): Promise<void> {
    return this.drop(this.sessionID);
  }

  //sessionRetries tracking
  private getRetryKey(sessionId: string, menuName: string): string {
    return `${sessionId}:${menuName}`;
  }

  private resetRetryCount(sessionId: string, menuName: string): void {
    const key = this.getRetryKey(sessionId, menuName);
    this.sessionRetries.set(key, 0);
  }

  private incrementRetryCount(sessionId: string, menuName: string): number {
    const key = this.getRetryKey(sessionId, menuName);
    const current = this.sessionRetries.get(key) || 0;
    const newCount = current + 1;
    this.sessionRetries.set(key, newCount);
    return newCount;
  }

  private isRetryLimitExceeded(sessionId: string, menuName: string): boolean {
    const menu = this.menus.get(menuName);
    if (!menu) return true;

    const maxRetries = menu.max_retries! || this.defaultMaxRetries;
    const key = this.getRetryKey(sessionId, menuName);
    const count = this.sessionRetries.get(key) || 0;

    return count >= maxRetries;
  }
}

export default UssdNavigator;
export type { UssdNavigator };
