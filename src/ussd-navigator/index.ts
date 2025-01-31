import {
  MenuNext,
  MenuNextAction,
  MenuNextPattern,
  MenuOptions,
  RunArgs,
} from "@src/types";
import UssdMenu from "./menu";

class UssdNavigator<T> {
  private menus: Map<string, UssdMenu<T>>;
  public start_menu = "__start__";

  public input: string;

  constructor() {
    this.menus = new Map();
  }

  addMenu(name: string, options: MenuOptions<T>) {
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

  resolveAction(action: string | MenuNextAction): Promise<string> {
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

  resolveRoute(path: Partial<RunArgs["path"]>): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let current_state = this.start_menu;

      const init = () => {
        const startState = this.menus.get(this.start_menu);

        if (!startState) {
          reject(new Error("Please add a start menu"));
          return;
        }

        if (
          startState.next &&
          startState.next.length > 0 &&
          startState.next.find((n) => n.pattern === "")
        ) {
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

        const nextState = currentstate.next?.find((n) =>
          this.matchPattern(n.pattern, p)
        );

        current_state = nextState
          ? await this.resolveAction(nextState.action)
          : null;
      }

      console.log(current_state);

      resolve(current_state);
    });
  }

  run(args: RunArgs) {
    return new Promise(async (success, error) => {
      const route = this.getRoute(args);
      const nextState = await this.resolveRoute(route);

      const state = this.menus.get(nextState);

      if (!state) {
        error(new Error("No state found"));
        return;
      }

      return success(state.run());
    });
  }
}

export default UssdNavigator;

export type { UssdNavigator };
