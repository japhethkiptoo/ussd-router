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
  menu_category: string | null | undefined;
  input: string;
  sessionID: string;
  serviceCode: string;
  phoneNumber: string;
  message: string;
  end: boolean;
};

export interface SessionStorage {
  get(key: string): Promise<any | null>;
  /**
   * @param ttl Optional time-to-live in seconds. Passed when `session_ttl`
   * is configured; implementations may ignore it.
   */
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export type RedisOptions = {
  /** Full connection URL, e.g. `redis://user:pass@host:6379/0` or `rediss://...`. Takes precedence over host/port/etc. */
  url?: string;
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  /** Database number. Defaults to 0. */
  db?: number;
  /** Use TLS (`rediss://`). */
  tls?: boolean;
  /** Session key expiry in seconds. Same as the top-level `session_ttl` option. */
  session_ttl?: number;
  /** An existing node-redis client to use instead of creating one. */
  client?: any;
};
