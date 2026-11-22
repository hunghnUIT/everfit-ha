// host:port/database, for the startup line: the URL itself carries the
// password and is never logged (design §13). 5432 when the URL names no port.
export function describeDatabaseUrl(url: string): string {
  const { hostname, port, pathname } = new URL(url);
  return `${hostname}:${port || '5432'}${pathname}`;
}
