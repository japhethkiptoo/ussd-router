export type MenuNextAction = () => string | Promise<string>;
export type MenuNextPattern = string | number | RegExp;

export type MenuNext = {
  pattern: MenuNextPattern;
  action: string | MenuNextAction;
};

export type MenuRunAction<T> = () => void | Promise<T> | T;

export type MenuOptions<T> = {
  run: MenuRunAction<T>;
  next?: MenuNext[];
  retriable?: boolean;
  retry_message?: string;
  max_retries?: number;
  category?: string;
};

export type RunArgs = {
  input: string;
  path: string[];
  sessionID: string;
  serviceCode: string;
  phoneNumber: string;
};

export type CoreMenuResponse = {
  message: string;
  end: boolean;
};

export type LoggerPayload = {
  menu: string;
  input: string;
};

export interface SessionStorage {
  get(key: string): Promise<any | null>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export type RedisOptions = {
  host: string;
  port: string;
  username: string;
  password: string;
};
