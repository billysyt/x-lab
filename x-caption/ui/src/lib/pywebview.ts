export function callApiMethod(api: any, names: string[], ...args: any[]) {
  for (const name of names) {
    const fn = api?.[name];
    if (typeof fn === "function") {
      return fn.call(api, ...args);
    }
  }
  return null;
}
