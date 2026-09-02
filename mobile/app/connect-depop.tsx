import { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { colors, spacing } from "../lib/theme";

// ───────────────────────────────────────────────────────────────────────────
// Depop connect — DIAGNOSTIC SPIKE. Reads only, sends NOTHING to VYA, stores nothing.
//
// It answers the one question that decides how the whole cross-listing feature gets built:
// after a completed on-device login, WHAT is Depop's session, and is it reachable from JavaScript?
//
//   · If auth rides a JS-readable token (localStorage / an Authorization header), we can capture it
//     with no native modules at all.
//   · If nothing readable turns up, the session is an httpOnly cookie — invisible to JS — and we'll
//     know the real flow needs native cookie access (and how to solve the New-Architecture issue).
//
// HOW: the WebView logs into Depop on THIS device (real phone, real IP → the login looks genuine,
// which is the whole point). A tiny script hooks fetch before the page loads to catch any
// Authorization header Depop's own API calls send. Then "Capture session" snapshots localStorage,
// sessionStorage and the cookie names the page can see. Everything is reported as SHAPES — a name,
// a length, whether it looks like a JWT — never a real value.
//
// Uses only react-native-webview (New-Architecture compatible). No @react-native-cookies/cookies,
// so no native-arch conflict. Needs a dev build (WebView is native): npx expo run:ios --device
// ───────────────────────────────────────────────────────────────────────────

const DEPOP_LOGIN = "https://www.depop.com/login/";

// Installed BEFORE the page's own scripts, so it catches auth headers from the very first API call.
const HOOK_FETCH = `
(function(){
  function shape(v){ if(!v) return null; var s=String(v);
    var l = /^ey[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\./.test(s) ? "JWT"
          : /^[0-9a-f-]{32,}$/i.test(s) ? "hex/uuid"
          : s.length>=20 ? "opaque" : "short";
    return { len:s.length, looks:l }; }
  function send(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  var seen = {};
  function note(headers){
    try{
      var get = headers && headers.get ? function(k){return headers.get(k);} : function(k){return headers ? headers[k] || headers[k.toLowerCase()] : null;};
      var a = get("Authorization") || get("authorization");
      if(a && !seen[String(a).slice(0,12)]){ seen[String(a).slice(0,12)]=1; send({type:"auth", header:"Authorization", value:shape(a)}); }
    }catch(e){}
  }
  var of = window.fetch;
  if(of){ window.fetch = function(input, init){ try{ note(init && init.headers); }catch(e){} return of.apply(this, arguments); }; }
  var xo = window.XMLHttpRequest && window.XMLHttpRequest.prototype.setRequestHeader;
  if(xo){ window.XMLHttpRequest.prototype.setRequestHeader = function(k,v){ try{ if(/^authorization$/i.test(k)) note({Authorization:v}); }catch(e){} return xo.apply(this, arguments); }; }
  true;
})();
`;

// Run on demand, after the seller has logged in.
const SNAPSHOT = `
(function(){
  function shape(v){ if(!v) return null; var s=String(v);
    var l = /^ey[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\./.test(s) ? "JWT"
          : /^[0-9a-f-]{32,}$/i.test(s) ? "hex/uuid"
          : s.length>=20 ? "opaque" : "short";
    return { len:s.length, looks:l }; }
  var out = { type:"snapshot", url:location.href, local:{}, session:{}, cookieNames:[] };
  try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); out.local[k]=shape(localStorage.getItem(k)); } }catch(e){}
  try{ for(var j=0;j<sessionStorage.length;j++){ var k2=sessionStorage.key(j); out.session[k2]=shape(sessionStorage.getItem(k2)); } }catch(e){}
  try{ out.cookieNames = document.cookie.split(";").map(function(c){return c.split("=")[0].trim();}).filter(Boolean); }catch(e){}
  window.ReactNativeWebView.postMessage(JSON.stringify(out));
  true;
})();
`;

type Shape = { len: number; looks: string } | null;
type Snapshot = { url: string; local: Record<string, Shape>; session: Record<string, Shape>; cookieNames: string[] };

export default function ConnectDepop() {
  const web = useRef<WebView>(null);
  const [authHeaders, setAuthHeaders] = useState<Shape[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  function onMessage(e: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "auth") setAuthHeaders((prev) => [...prev, msg.value]);
      if (msg.type === "snapshot") setSnap(msg);
    } catch { /* ignore non-JSON page chatter */ }
  }

  const rows = (obj: Record<string, Shape>) =>
    Object.entries(obj).filter(([, v]) => v).map(([k, v]) => (
      <Text key={k} style={styles.mono}>{k} — {v!.len} chars · {v!.looks}</Text>
    ));

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Log into Depop below, on this phone. Once you&rsquo;re signed in, tap Capture — it reads
          what the session looks like. Nothing is sent anywhere.
        </Text>
      </View>

      <WebView
        ref={web}
        source={{ uri: DEPOP_LOGIN }}
        injectedJavaScriptBeforeContentLoaded={HOOK_FETCH}
        onMessage={onMessage}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        style={styles.web}
      />

      <Pressable style={styles.capture} onPress={() => web.current?.injectJavaScript(SNAPSHOT)}>
        <Text style={styles.captureText}>Capture session</Text>
      </Pressable>

      {(snap || authHeaders.length > 0) && (
        <ScrollView style={styles.results} contentContainerStyle={styles.resultsPad}>
          <Text style={styles.h2}>What&rsquo;s readable from JavaScript</Text>

          <Text style={styles.label}>Authorization headers seen ({authHeaders.length})</Text>
          {authHeaders.length === 0
            ? <Text style={styles.dim}>None — auth isn&rsquo;t a JS bearer token.</Text>
            : authHeaders.map((a, i) => a && <Text key={i} style={styles.mono}>Bearer — {a.len} chars · {a.looks}</Text>)}

          {snap && (
            <>
              <Text style={styles.label}>localStorage</Text>
              {rows(snap.local).length ? rows(snap.local) : <Text style={styles.dim}>empty</Text>}
              <Text style={styles.label}>sessionStorage</Text>
              {rows(snap.session).length ? rows(snap.session) : <Text style={styles.dim}>empty</Text>}
              <Text style={styles.label}>Cookie names visible to JS</Text>
              {snap.cookieNames.length
                ? <Text style={styles.mono}>{snap.cookieNames.join(", ")}</Text>
                : <Text style={styles.dim}>none visible — the session is httpOnly (native access needed)</Text>}
            </>
          )}
          <Text style={styles.footnote}>
            Screenshot this and send it back. If everything is empty and no Authorization header
            appeared, the session is httpOnly — an important answer, not a failure.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  banner: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  bannerText: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  capture: { backgroundColor: colors.accent, paddingVertical: spacing.md, alignItems: "center" },
  captureText: { color: colors.accentText, fontSize: 14, fontWeight: "600" },
  results: { maxHeight: "45%", backgroundColor: colors.bgCard, borderTopWidth: 1, borderTopColor: colors.border },
  resultsPad: { padding: spacing.lg, gap: spacing.xs },
  h2: { fontFamily: "Georgia", fontSize: 20, color: colors.text, marginBottom: spacing.sm },
  label: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.textDim, marginTop: spacing.md },
  mono: { fontFamily: "Courier", fontSize: 12, color: colors.text, marginTop: 2 },
  dim: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.lg },
});
