import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { retagFavourites } from "./favourites-icon.ts";

const person = `<svg class="Icon Icon--account" viewBox="0 0 20 20"><g stroke="currentColor"><circle cx="9" cy="6" r="4"/><path d="M1 18a8 8 0 0116 0"/></g></svg>`;

test("a favourites link wearing a person glyph gets a heart", () => {
 // we-thieves' header shows a little person that goes to /favorites, right next to our account
 // button. Two identical glyphs meaning different things is a guess a shopper should not have to make.
 const html = `<html><body><header><a href="/favorites" class="Header__Icon">${person}</a></header></body></html>`;
 const $ = cheerio.load(retagFavourites(html));
 assert.equal($('a[href="/favorites"] svg[data-vya-heart]').length, 1);
 assert.equal($('a[href="/favorites"] svg').length, 1, "replaced, not added alongside");
});

test("the theme's own sizing is kept", () => {
 // Themes size their icons by class, not by attribute. Dropping the class shrinks the icon to
 // whatever our own markup says and it stops matching the row it sits in.
 const html = `<html><body><a href="/favorites"><svg class="Icon Icon--account" width="18" height="18" viewBox="0 0 20 20"><circle cx="9" cy="6" r="4"/></svg></a></body></html>`;
 const svg = cheerio.load(retagFavourites(html))("svg");
 assert.match(svg.attr("class") || "", /Icon--account|Icon/);
 assert.equal(svg.attr("width"), "18");
 assert.equal(svg.attr("height"), "18");
});

test("an account link is never touched", () => {
 // The whole point is telling the two apart. Putting a heart on a sign-in link would be worse
 // than the problem it fixes.
 const html = `<html><body><a href="/account/login">${person}</a></body></html>`;
 assert.equal(retagFavourites(html), html);
});

test("a favourites link that already has its own icon is left alone", () => {
 const heart = `<svg class="icon icon-heart" viewBox="0 0 24 24"><path d="M12 20 4 12a4 4 0 118-5 4 4 0 118 5z"/></svg>`;
 const html = `<html><body><a href="/favorites">${heart}</a></body></html>`;
 assert.equal(retagFavourites(html), html, "only a PERSON glyph is a mistake worth correcting");
});

test("wishlists count as favourites, however they are spelled", () => {
 for (const href of ["/pages/wishlist", "/favourites", "/apps/wishlist", "/pages/favorites"]) {
  const html = `<html><body><a href="${href}">${person}</a></body></html>`;
  assert.equal(cheerio.load(retagFavourites(html))("svg[data-vya-heart]").length, 1, href);
 }
});

test("a link with no accessible name gets one, and an existing one is respected", () => {
 const bare = cheerio.load(retagFavourites(`<html><body><a href="/favorites">${person}</a></body></html>`))("a");
 assert.equal(bare.attr("aria-label"), "Favorites");
 const named = cheerio.load(retagFavourites(`<html><body><a href="/favorites" aria-label="Saved pieces">${person}</a></body></html>`))("a");
 assert.equal(named.attr("aria-label"), "Saved pieces", "her words, not ours");
});

test("a link that already says what it is in words is left unlabelled", () => {
 const $ = cheerio.load(retagFavourites(`<html><body><a href="/favorites">Favourites ${person}</a></body></html>`))("a");
 assert.equal($.attr("aria-label"), undefined, "the text is already the name");
});

test("running twice changes nothing the second time", () => {
 const html = `<html><body><a href="/favorites">${person}</a></body></html>`;
 const once = retagFavourites(html);
 assert.equal(retagFavourites(once), once);
});

test("a page with no favourites link is returned byte for byte", () => {
 const html = `<html><body><a href="/collections/all">Shop</a></body></html>`;
 assert.equal(retagFavourites(html), html);
});

test("the heart is an outline, whatever her stylesheet says about that class", () => {
 // Keeping her class is what makes the icon the right size — and that class carried her own
 // `fill: currentColor`, which beats a fill="none" ATTRIBUTE and rendered the heart as a solid
 // black blob in a row of outlined icons. Only an inline style outranks her stylesheet.
 const html = `<html><body><a href="/favorites"><svg class="Icon Icon--account" viewBox="0 0 20 20"><circle cx="9" cy="6" r="4"/></svg></a></body></html>`;
 const style = cheerio.load(retagFavourites(html))("svg").attr("style") || "";
 assert.match(style, /fill:\s*none/);
 assert.match(style, /stroke:\s*currentColor/);
});

test("her own inline style on the icon is kept", () => {
 const html = `<html><body><a href="/favorites"><svg class="icon-account" style="margin-top:2px" viewBox="0 0 20 20"><circle cx="9" cy="6" r="4"/></svg></a></body></html>`;
 const style = cheerio.load(retagFavourites(html))("svg").attr("style") || "";
 assert.match(style, /margin-top:2px/);
 assert.match(style, /fill:\s*none/);
});

test("a theme that names every icon the same still gets a heart on favourites", () => {
 // thenicheshop calls all of them `theme-icon`, and its favourites glyph is a person by drawing
 // rather than by name. We cannot read a path and tell — but a heart on a favourites link is
 // never wrong, so an unnamed glyph is replaced rather than left to be guessed at.
 const html = `<html><body><a href="/favorites"><svg class="theme-icon" viewBox="0 0 48 48"><path d="M24 4"/></svg></a></body></html>`;
 assert.equal(cheerio.load(retagFavourites(html))("svg[data-vya-heart]").length, 1);
});
