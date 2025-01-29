import { MenuNext, MenuOptions, MenuRunAction } from "@src/types";

class UssdMenu<T> {
  run: MenuRunAction<T>;
  next: MenuNext[];

  constructor(options: MenuOptions<T>) {
    this.run = options.run;
    this.next = options.next;
  }
}

export default UssdMenu;
export type { UssdMenu };
