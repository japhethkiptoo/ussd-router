import { MenuNext, MenuOptions, MenuRunAction } from "../types";

class UssdMenu<T> {
  readonly name: string;
  run: MenuRunAction<T>;
  next: MenuNext[];
  retriable: boolean;
  max_retries?: number;
  retry_message: string | null;
  category?: string;

  constructor(options: { name: string } & MenuOptions<T>) {
    this.name = options.name;
    this.run = options.run;
    this.next = options.next!;
    this.retriable = options.retriable ?? true;
    this.retry_message = options.retry_message || null;
    this.max_retries = options.max_retries;
    this.category = options.category || "default";
  }
}

export default UssdMenu;
export type { UssdMenu };
