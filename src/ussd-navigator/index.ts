import { MenuOptions, RunArgs } from "@src/types";
import UssdMenu from "./menu";

class UssdNavigator<T> {
  private menus: Map<string, UssdMenu<T>>;
  public start_menu = "__start__";

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

  run(args: RunArgs) {
    return new Promise((success, error) => {
      const state = this.menus.get("start");

      if (!state) error(new Error("Blaaa"));

      success(state.run());
    });
  }
}

export default UssdNavigator;

export type { UssdNavigator };
