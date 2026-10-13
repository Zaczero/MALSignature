import { expect, test } from "bun:test";
import { ProfileError, parseProfile, usernameInput } from "../src/profile";

const html = `<!doctype html><title>Example_User&#039;s Profile - MyAnimeList.net</title>
<div class="user-image"><img data-src="https://cdn.myanimelist.net/images/userimages/42.jpg"></div>
<div class="stats anime"><div class="di-tc"><span>Days: </span>42.5</div>
<ul class="stats-data"><li><span>Total Entries</span><span>15</span></li>
<li><span>Episodes</span><span>1,204</span></li></ul></div>
<div class="updates anime"><img data-src="https://cdn.myanimelist.net/r/80x120/images/anime/1/23.jpg?x=1&amp;y=2" alt="Spice &amp; Wolf"></div>`;

test("Parse the supported profile fields and decode text entities", async () => {
  expect(await parseProfile(html, "example_user")).toEqual({
    username: "Example_User",
    avatar: "https://cdn.myanimelist.net/images/userimages/42.jpg",
    days: "42.5",
    episodes: "1,204",
    anime: [
      {
        title: "Spice & Wolf",
        image:
          "https://cdn.myanimelist.net/r/80x120/images/anime/1/23.jpg?x=1&y=2",
      },
    ],
  });
});

test("Reject a different profile rather than render another user's data", async () => {
  expect(parseProfile(html, "different_user")).rejects.toBeInstanceOf(
    ProfileError,
  );
});

test("A missing profile picture returns an actionable profile error", async () => {
  expect(
    parseProfile(
      html.replace(
        /<img data-src="https:\/\/cdn.myanimelist.net\/images\/userimages\/42.jpg">/,
        "",
      ),
      "Example_User",
    ),
  ).rejects.toMatchObject({ status: 422 });
});

test.each([
  "https://myanimelist.net/profile/user",
  "../user",
  "",
  "user?other=true",
])("Reject invalid username %s", (value) => {
  expect(() => usernameInput(value)).toThrow(ProfileError);
});
