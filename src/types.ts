type MenuNextAction = () => string | Promise<string>;
type MenuNextPattern = string | number | RegExp;

export type MenuNext = {
  pattern: MenuNextPattern;
  action: string | MenuNextAction;
};

export type MenuRunAction<T> = () => void | Promise<T> | T;

export type MenuOptions<T> = {
  run: MenuRunAction<T>;
  next: MenuNext[];
};

export type RunArgs = {
  input: string;
  path: string[];
  sessionID: string;
  serviceCode: string;
  phoneNumber: string;
};
