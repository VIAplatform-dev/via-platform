import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotScanningAFlyer } from "./flyer-bot.ts";

test("a QR scanner app is a person, not a bot", () => {
 // THE BUG THIS EXISTS FOR: the shared filter drops any UA containing "scanner", which is how a
 // large share of people open a printed QR code. On a flyer campaign that throws away the exact
 // audience being measured.
 assert.equal(isBotScanningAFlyer("Mozilla/5.0 (iPhone) QRScanner/4.2"), false);
 assert.equal(isBotScanningAFlyer("Mozilla/5.0 (Android) Barcode Scanner"), false);
});

test("ordinary phone browsers are people", () => {
 assert.equal(isBotScanningAFlyer("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1"), false);
 assert.equal(isBotScanningAFlyer("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36"), false);
});

test("real crawlers are still excluded", () => {
 for (const ua of ["Googlebot/2.1", "AhrefsBot", "python-requests/2.31", "curl/8.4", "HeadlessChrome/120"]) {
  assert.equal(isBotScanningAFlyer(ua), true, ua);
 }
});

test("link unfurlers are excluded — they fetch the page, nobody looked at it", () => {
 // Someone pasting the flyer URL into a chat makes these fire without a human ever arriving.
 for (const ua of ["WhatsApp/2.23", "TelegramBot (like TwitterBot)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding"]) {
  assert.equal(isBotScanningAFlyer(ua), true, ua);
 }
});

test("a missing user-agent counts as a person", () => {
 // Unusual but not proof of a bot, and under-counting a real scan is the worse error here.
 assert.equal(isBotScanningAFlyer(null), false);
 assert.equal(isBotScanningAFlyer(undefined), false);
});
