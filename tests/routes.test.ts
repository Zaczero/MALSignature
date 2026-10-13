import { expect, test } from "bun:test";
import { imageRoute } from "../src/routes";

test.each([
  ["/?/view?username=Some_User&style=normal", "Some_User", "normal"],
  ["/?/view?username=Some_User&amp;style=small", "Some_User", "small"],
  ["/?view&username=Some_User", "Some_User", "normal"],
  [
    "/index.php?/view.php?username=Some%5FUser&style=small",
    "Some_User",
    "small",
  ],
  ["/view.php?a=Some_User&b=1", "Some_User", "small"],
  ["/view.php?amp;a=Some_User&amp;b=1", "Some_User", "small"],
  ["/view.php?a=Some_User&b=2", "Some_User", "normal"],
] as const)("Preserve released image URL %s", (path, username, style) => {
  expect(imageRoute(new URL(path, "https://malsignature.com"))).toEqual({
    username,
    style,
  });
});

test("Page routes and old internal image filenames are not image resolvers", () => {
  expect(imageRoute(new URL("https://malsignature.com/"))).toBeNull();
  expect(
    imageRoute(new URL("https://malsignature.com/?/ranking?page=1")),
  ).toBeNull();
  expect(
    imageRoute(
      new URL("https://malsignature.com/img/signatures/__normal_123.png"),
    ),
  ).toBeNull();
});
