import { MenuNext, MenuOptions, MenuRunAction } from "../types";

class UssdMenu<T> {
  run: MenuRunAction<T>;
  next: MenuNext[];
  retriable: boolean;
  retry_message: string | null;
  category?: string;

  constructor(options: MenuOptions<T>) {
    this.run = options.run;
    this.next = options.next!;
    this.retriable = options.retriable ?? true;
    this.retry_message = options.retry_message || null;
    this.category = options.category || "default";
  }
}

export default UssdMenu;
export type { UssdMenu };
