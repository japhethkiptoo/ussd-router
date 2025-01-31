import { MenuNext, MenuOptions, MenuRunAction } from "@src/types";

class UssdMenu<T> {
  run: MenuRunAction<T>;
  next: MenuNext[];
  retriable: boolean;
  retry_message: string | null;

  constructor(options: MenuOptions<T>) {
    this.run = options.run;
    this.next = options.next;
    this.retriable = options.retriable ?? true;
    this.retry_message = options.retry_message || null;
  }
}

export default UssdMenu;
export type { UssdMenu };
