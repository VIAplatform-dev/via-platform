// Is this flyer arrival a machine rather than a person?
//
// SEPARATE FROM isLikelyBotScan (app/lib/qr-codes.ts) FOR ONE REASON: that filter drops any
// user-agent containing "scanner", which is correct for the printed business cards it was written
// for and badly wrong here. A large share of people open a printed QR with a dedicated scanner
// app, and its in-app browser says so in the user-agent — so the shared filter silently discards
// the exact audience a flyer campaign exists to measure. Found the hard way: six codes scanned,
// one recorded.
//
// "preview" and "monitor" are dropped from the list for the same reason — both appear in ordinary
// mobile browser and in-app webview strings — while the link unfurlers that genuinely represent
// nobody (WhatsApp, Telegram, Slack, Facebook) stay excluded, because a pasted link should not
// register as someone walking past a poster.
//
// The bias here is deliberate: under-counting a real scan is worse than counting a stray fetch.
// A poster that looks unscanned gets pulled; a poster with a couple of phantom hits does not.

const BOT_UA =
 /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|slackbot|discordapp|embedly|curl|wget|python-requests|node-fetch|axios|headless|lighthouse|feedfetcher|pingdom|uptime/i;

export function isBotScanningAFlyer(userAgent: string | null | undefined): boolean {
 if (!userAgent) return false; // unusual, but not proof — count it
 return BOT_UA.test(userAgent);
}
