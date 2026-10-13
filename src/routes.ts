export function imageRoute(
  url: URL,
): { username: string; style: "normal" | "small" } | null {
  let params: URLSearchParams;
  let legacy = false;
  if (url.pathname === "/view.php") {
    params = url.searchParams;
    legacy = true;
  } else if (
    (url.pathname === "/" || url.pathname === "/index.php") &&
    /^\/?view(?:\.php)?(?:[?&]|$)/.test(url.search.slice(1))
  ) {
    params = new URLSearchParams(
      url.search.slice(1).replace(/^\/?view(?:\.php)?[?&]?/, ""),
    );
  } else return null;
  const value = (name: string) =>
    params.get(`amp;${name}`) ?? params.get(name) ?? "";
  return {
    username: value(legacy ? "a" : "username"),
    style:
      value(legacy ? "b" : "style") === (legacy ? "1" : "small")
        ? "small"
        : "normal",
  };
}
