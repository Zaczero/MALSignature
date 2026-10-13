import { expect, test } from "bun:test";
import { imageAccess } from "../src/access-log";

const time = 1_791_288_000_125;
function log(
  uri: string,
  status = 200,
  method = "GET",
  host = "malsignature.com",
) {
  return JSON.stringify({
    ts: time / 1000,
    status,
    request: { host, method, uri },
  });
}

test.each([
  "/?/view?username=Example_User&style=normal",
  "/index.php?/view?username=Example_User&amp;style=small",
  "/view.php?a=Example_User&b=1",
])(
  "Read successful image access %s without style-dependent identity",
  (uri) => {
    expect(imageAccess(log(uri))).toEqual({ username: "Example_User", time });
  },
);

test("Conditional revalidation and journal wrappers retain the original event timestamp", () => {
  expect(
    imageAccess(
      JSON.stringify({ MESSAGE: log("/view.php?a=Example_User", 304) }),
    ),
  ).toEqual({
    username: "Example_User",
    time,
  });
});

test.each([
  log("/ranking/"),
  log("/api/generate"),
  log("/view.php?a=Example_User", 404),
  log("/view.php?a=Example_User", 200, "HEAD"),
  log("/view.php?a=Example_User", 200, "GET", "example.invalid"),
  log("/view.php?a=.."),
  JSON.stringify({
    ts: "not a timestamp",
    status: 200,
    request: {
      host: "malsignature.com",
      method: "GET",
      uri: "/view.php?a=Example_User",
    },
  }),
])("Ignore non-activity log record %#", (record) => {
  expect(imageAccess(record)).toBeNull();
});
