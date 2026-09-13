import { test } from "node:test";
import assert from "node:assert";
import {
  newArrivalsPush, storeDropPush, trendingPush, viewedItemPush, lastChancePush,
  abandonedCartPush, winbackPush, savedSearchPush, favoritePush,
} from "./shopper-push-core.ts";

const ITEM = { id: 1, name: "Chanel 2000s flap bag" };

test("a push names the piece, not the category", () => {
  // "1 new item" is a reason to turn notifications off.
  assert.match(trendingPush([ITEM])!.body, /Chanel 2000s flap bag/);
  assert.match(viewedItemPush([ITEM])!.body, /Chanel 2000s flap bag/);
  assert.match(lastChancePush([ITEM])!.body, /Chanel 2000s flap bag/);
  assert.match(abandonedCartPush([ITEM])!.body, /Chanel 2000s flap bag/);
  assert.match(favoritePush([ITEM])!.body, /Chanel 2000s flap bag/);
});

test("it names one and counts the rest", () => {
  const many = [ITEM, { id: 2, name: "Fendi baguette" }, { id: 3, name: "Dior saddle" }];
  assert.match(trendingPush(many)!.body, /Chanel 2000s flap bag and 2 more/);
});

test("nothing is sent when there is nothing to name", () => {
  // A push reading "undefined is still available" is worse than silence.
  assert.equal(trendingPush([]), null);
  assert.equal(viewedItemPush([{ id: 1, name: "" }]), null);
  assert.equal(lastChancePush([{ id: 1, name: null }]), null);
  assert.equal(abandonedCartPush([]), null);
  assert.equal(favoritePush([]), null);
});

test("counts that cannot be true send nothing", () => {
  assert.equal(newArrivalsPush(0), null);
  assert.equal(newArrivalsPush(-3), null);
  assert.equal(newArrivalsPush(NaN), null);
  assert.equal(storeDropPush("Hachi Archive", 0, "hachi"), null);
  assert.equal(storeDropPush("", 4, "hachi"), null);
  assert.equal(savedSearchPush("Chanel", 0), null);
  assert.equal(savedSearchPush("  ", 3), null);
});

test("new arrivals says what she asked for", () => {
  assert.equal(newArrivalsPush(12)!.title, "New pieces just dropped");
  assert.match(newArrivalsPush(12)!.body, /12 new pieces/);
  // With a name it leads on the name and counts the remainder.
  assert.match(newArrivalsPush(12, [ITEM])!.body, /Chanel 2000s flap bag and 11 more/);
  assert.match(newArrivalsPush(1, [ITEM])!.body, /Chanel 2000s flap bag and more/);
});

test("singular and plural are both right", () => {
  assert.match(newArrivalsPush(1)!.body, /1 new piece just/);
  assert.match(storeDropPush("Hachi", 1, "h")!.body, /1 new piece\./);
  assert.match(storeDropPush("Hachi", 4, "h")!.body, /4 new pieces\./);
  assert.match(savedSearchPush("Chanel", 1)!.body, /New piece matching/);
  assert.match(savedSearchPush("Chanel", 5)!.body, /New pieces matching/);
});

test("winback changes its tone with how long it has been", () => {
  assert.notEqual(winbackPush("14d").body, winbackPush("30d").body);
  assert.match(winbackPush("30d").body, /month/);
});

test("every push carries a type the app can route on", () => {
  // A notification that opens the home screen has wasted the tap.
  const all = [
    newArrivalsPush(3), storeDropPush("Hachi", 2, "hachi"), trendingPush([ITEM]),
    viewedItemPush([ITEM]), lastChancePush([ITEM]), abandonedCartPush([ITEM]),
    winbackPush("14d"), savedSearchPush("Chanel", 2), favoritePush([ITEM]),
  ];
  for (const p of all) {
    assert.ok(p, "builder returned null for valid input");
    assert.ok(typeof p!.data?.type === "string" && (p!.data!.type as string).length > 0, JSON.stringify(p));
  }
});

test("titles and bodies stay short enough for a lock screen", () => {
  const long = { id: 1, name: "Christian Dior by John Galliano Spring Summer 2004 Silk Chiffon Bias Cut Gown" };
  const all = [
    newArrivalsPush(3, [long]), trendingPush([long]), viewedItemPush([long]),
    lastChancePush([long]), abandonedCartPush([long]), favoritePush([long]),
  ];
  for (const p of all) {
    assert.ok(p!.title.length <= 40, `title too long: ${p!.title}`);
    // iOS shows roughly this much of the body on a locked screen before truncating.
    assert.ok(p!.body.length <= 178, `body too long (${p!.body.length}): ${p!.body}`);
  }
});
