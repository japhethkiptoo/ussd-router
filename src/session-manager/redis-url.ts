import { RedisOptions } from "../types";

/**
 * Builds a node-redis connection URL:
 * redis[s]://[[username][:password]@]host[:port][/db-number]
 */
export function buildRedisUrl(options: RedisOptions): string {
  if (options.url) {
    if (!/^rediss?:\/\//.test(options.url)) {
      throw new Error(
        `Invalid redis url "${options.url}": must start with redis:// or rediss://`,
      );
    }
    return options.url;
  }

  const {
    host = "127.0.0.1",
    port = 6379,
    username,
    password,
    db = 0,
    tls = false,
  } = options;

  const scheme = tls ? "rediss" : "redis";

  let auth = "";
  if (username && password) {
    auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  } else if (password) {
    auth = `:${encodeURIComponent(password)}@`;
  } else if (username) {
    auth = `${encodeURIComponent(username)}@`;
  }

  return `${scheme}://${auth}${host}:${port}/${db}`;
}
