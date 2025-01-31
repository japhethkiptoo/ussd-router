import {
  CoreMenuResponse,
  MenuNextAction,
  MenuNextPattern,
  MenuOptions,
  RunArgs,
} from "@src/types";
import UssdMenu from "./menu";

class UssdNavigator<T> {
  private menus: Map<string, UssdMenu<T>>;
  public start_menu = "__start__";
  public sorry_menu = "__sorry__";

  public input: string;
  public sessionID: string;
  public serviceCode: string;
  public phoneNumber: string;

  public defaultRetryMessage: string;

  constructor(options?: any) {
    this.menus = new Map();

    this.defaultRetryMessage =
      options?.retry_message || "Invalid input. Please try again.";
  }

  addMenu(name: string, options: MenuOptions<T>) {
    if (this.menus.has(name)) {
      throw new Error(`Menu ${name} already exists`);
    }
    const menu = new UssdMenu({
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
    console.log("Pattern:", pattern, "Input:", input);
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
      console.log(path);
      for (const p of path) {
        const currentstate = this.menus.get(current_state);
        this.input = p;

        if (!currentstate) {
          reject(new Error("No state found"));
          return;
        }

        console.log(p);
        console.log(currentstate.next);

        const nextState = currentstate.next?.find((n) =>
          this.matchPattern(n.pattern, p)
        );

        console.log("nextState", nextState);

        if (nextState) {
          current_state = await this.resolveAction(nextState.action);
          is_retry = false;
          console.log("current_state:MM", current_state);
        }

        if (!nextState) {
          const { state } = await this.handleRetry(current_state);
          console.log("state", state);
          current_state = state;
          is_retry = true;
        }
      }

      console.log("Final: state", current_state);

      resolve({ state: current_state, is_retry });
    });
  }

  run(args: RunArgs): Promise<{ message: string; end: boolean }> {
    return new Promise(async (success, error) => {
      const route = this.getRoute(args);
      const { state: nextState, is_retry } = await this.resolveRoute(route);

      const state = this.menus.get(nextState);

      if (!state) {
        error(new Error("No state found"));
        return;
      }

      if (is_retry) {
        success({
          message: state?.retry_message || this.defaultRetryMessage,
          end: false,
        });
        return;
      }

      const result = (await Promise.resolve(state.run())) as CoreMenuResponse &
        T;
      success({ ...result });
      return;
    });
  }
}

export default UssdNavigator;

export type { UssdNavigator };
