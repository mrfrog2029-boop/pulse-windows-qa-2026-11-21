import { $ as tl, B as nl, C as rl, D as al, E as il, F as sl, G as ol, H as c, I, J as ne, K as Xt, M as pe, N as gr, O as Oa, P as hr, Q as ct, R as ja, S as yr, T as Te, U as vr, V as En, W as ll, X as cl, Y as Ha, Z as H, _ as dt, aa as dl, ba as ul, ca as ml, d as Ua, ea as _e, fa as qa, ga as Fa, ha as Dn, i as pl, ia as fl, j as za, ja as gl, k as hl, ka as yl, l as _a, m as vl, ma as Ye, o as bl, p as wl, r as Na, s as Va, t as kl, u as Ka, v as Zt, w as xl, x as Sl, y as Ee } from "./chunk-7GRP2DEX.js";
import * as Qt from "./account.js";
import { RoomLinks } from "./room-links.js";
import { isRoomCode, openRoomRelay, verifyRoomEntry } from "./room-relay.js";
import * as Xe from "./guard.js";
import { RELAYS as bs, relayUrls, savedRelayPreference, rememberRelayUrls } from "./net.js";
import { networkNow, refreshNetworkTime } from "./network-time.js";
import { networkReport, traceRoom } from "./network-diagnostics.js";
let lastDirectoryCount;

function confirmedNick() {
  if (!v.nick) return null;
  const vault = pe.get("vault", null);
  return vault?.pending && vault.checkNick ? null : v.nick;
}

function friendSharing() {
  const confirmed = confirmedNick();
  const status = !v.nick ? "unset" : !confirmed ? "registration" : Qt.nickDirectoryStatus();
  const nick = status === "published" && confirmed ? `@${confirmed}` : null;
  let description = "Скопируй ID и отправь его другу.";
  let nicknameLabel = "Выбрать @ник";
  if (nick) {
    description = "Ник опубликован в каталоге Pulse.";
    nicknameLabel = nick;
  } else if (v.nick) {
    const availability = status === "registration" ? "ожидает подтверждения" : status === "unavailable" ? "каталог недоступен" : "публикуется";
    description = status === "unavailable" ? "Каталог недоступен. Поделись ID." : `Ник ${availability}. Поделись ID.`;
    nicknameLabel = `@${v.nick} · ${availability}`;
  }
  return { code: Ee().friendCode, nick, description, nicknameLabel, status };
}

function renderFriendSharing() {
  const { code, nick, description, nicknameLabel, status } = friendSharing();
  for (const id of ["w-id", "af-my"]) c(id).replaceChildren(I("span", { text: nick || code }), ne("copy", "sm"));
  c("s-friendcode").replaceChildren(I("span", { text: code }), ne("copy", "sm"));
  c("s-nick").replaceChildren(I("span", { text: nicknameLabel }), ne(v.nick ? "copy" : "pencil", "sm"));
  c("s-nick").title = nick ? "Скопировать @ник" : v.nick ? "Скопировать ID для друзей" : "Выбрать @ник";
  c("s-nick-edit").classList.toggle("hidden", status !== "registration");
  c("w-id-title").textContent = nick ? "Твой @ник" : "Твой ID";
  c("w-share-status").textContent = description;
  c("af-share-status").textContent = nick ? "" : description;
}

function bindFriendSharing() {
  for (const id of ["w-id", "af-my", "s-nick", "s-friendcode"]) {
    c(id).addEventListener("click", () => {
      if (id === "s-nick" && !v.nick) return Qt.askNick();
      const { code, nick } = friendSharing();
      if (nick && id !== "s-friendcode") dt(nick, "Ник скопирован — отправь другу");
      else dt(code, "ID скопирован — отправь другу");
    });
  }
  c("s-nick-edit").addEventListener("click", () => Qt.askNick());
}

function describeFriendStatus(friend) {
  if (friend.typingUntil > Date.now()) return "печатает…";
  const state = W.getPresence(friend.pub);
  if (state === "online") return friend.bio ? `в сети · ${friend.bio}` : "в сети";
  if (state === "offline") return "не в сети";
  if (!Qt.getPool().readableCount()) return "статус неизвестен · нет связи с каталогом";
  return friend.lastSeen ? `статус неизвестен · был(а) ${cl(friend.lastSeen)}` : "статус неизвестен";
}
var br = Object.freeze, ut = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn, en = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, Wa = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, Ga = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n, Tl = br({ p: ut, n: en, h: 1n, a: 0n, b: 7n, Gx: Wa, Gy: Ga }), Ne = 32, Ja = (e) => e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && e.BYTES_PER_ELEMENT === 1, Be = (e, t, n = "") => {
  if (Ja(e) && (t === void 0 || e.length === t)) return e;
  let r = Ja(e), a = t !== void 0 ? ` of length ${t}` : "", i = r ? `length=${e.length}` : `type=${typeof e}`, s = (n ? `"${n}" ` : "") + "expected Uint8Array" + a + ", got " + i;
  throw r ? new RangeError(s) : new TypeError(s);
}, Pl = (e) => Uint8Array.from(e), Il = (e, t, n) => Pl(Be(e, n, t)), Ya = (e, t) => e.toString(16).padStart(t, "0"), Xa = (e) => {
  let t = "";
  for (let n of Be(e)) t += Ya(n, 2);
  return t;
}, Za = (e) => {
  let t = "hex invalid";
  if (typeof e != "string") throw new TypeError(t);
  if (e.length % 2 || !/^[\da-f]*$/i.test(e)) throw new RangeError(t);
  let n = new Uint8Array(e.length / 2);
  for (let r = 0, a = 0; r < n.length; r++, a += 2) {
    let i = e.charCodeAt(a), s = e.charCodeAt(a + 1);
    n[r] = ((i & 15) + (i >> 6) * 9) * 16 + (s & 15) + (s >> 6) * 9;
  }
  return n;
}, Qa = () => {
  let e = globalThis?.crypto?.subtle;
  if (e) return e;
  throw new Error("crypto.subtle must be defined, consider polyfill");
}, $t = (...e) => {
  let t = 0;
  for (let a of e) t += Be(a).length;
  let n = new Uint8Array(t), r = 0;
  for (let a of e) n.set(a, r), r += a.length;
  return n;
}, wr = (e = Ne) => {
  let t = globalThis?.crypto;
  if (typeof t?.getRandomValues != "function") throw new Error("crypto.getRandomValues must be defined, consider polyfill");
  return t.getRandomValues(new Uint8Array(e));
}, Ll = BigInt, tn = (e, t, n, r = "bad number: out of range") => {
  if (typeof e != "bigint") throw new TypeError(r);
  if (t <= e && e < n) return e;
  throw new RangeError(r);
}, N = (e, t = ut) => (e %= t) >= 0n ? e : t + e, Mn = (e) => N(e, en), El = (e, t) => {
  if (e === 0n) throw new Error("invert: expected non-zero number");
  if (t <= 1n) throw new Error("invert: expected modulus > 1, got " + t);
  let n = N(e, t), r = t, a = 0n, i = 1n;
  for (; n !== 0n; ) {
    let s = r / n, m = r - n * s, u = a - i * s;
    r = n, n = m, a = i, i = u;
  }
  if (r !== 1n) throw new Error("invert: does not exist");
  return N(a, t);
}, ei = (e) => {
  let t = Rl[e];
  if (typeof t != "function") throw new Error("hashes." + e + " not set");
  return t;
}, ti = (e, t, n) => Be(ei(e)(t, n), Ne, "digest"), ni = async (e, t, n) => Be(await ei(e)(t, n), Ne, "digest"), kr = (e) => {
  if (e instanceof Ct) return e;
  throw new TypeError("Point expected");
}, xr = "bad point: not on curve", ri = (e) => N(N(e * e) * e + 7n), ai = (e) => tn(e, 0n, ut), nn = (e) => tn(e, 1n, ut), ii = (e) => tn(e, 1n, en), An = (e) => !(e & 1n), Dl = (e) => Uint8Array.of(An(e) ? 2 : 3), si = (e) => {
  let t = ri(nn(e)), n = 1n;
  for (let r = t, a = (ut + 1n) / 4n; a > 0n; a >>= 1n) a & 1n && (n = n * r % ut), r = r * r % ut;
  if (N(n * n) !== t) throw new Error("sqrt invalid");
  return new Ct(e, An(n) ? n : N(-n), 1n);
}, Ct = class Yt {
  static BASE;
  static ZERO;
  X;
  Y;
  Z;
  constructor(t, n, r) {
    this.X = ai(t), this.Y = nn(n), this.Z = ai(r), br(this);
  }
  static CURVE() {
    return Tl;
  }
  static fromAffine(t) {
    let { x: n, y: r } = t;
    return n === 0n && r === 0n ? rn : new Yt(n, r, 1n);
  }
  static fromBytes(t) {
    Be(t);
    let n = t.length, r = t[0], a = Rn(t, 1, 33);
    try {
      if (n === 33 && (r === 2 || r === 3)) {
        let i = si(a);
        return r === 3 ? i.negate() : i;
      }
      if (n === 65 && r === 4) return new Yt(a, Rn(t, 33, 65), 1n).assertValidity();
    } catch {
      throw new Error(xr);
    }
    throw new Error(xr);
  }
  static fromHex(t) {
    return Yt.fromBytes(Za(t));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  equals(t) {
    let { X: n, Y: r, Z: a } = this, { X: i, Y: s, Z: m } = kr(t);
    return N(n * m) === N(i * a) && N(r * m) === N(s * a);
  }
  is0() {
    return this.Z === 0n;
  }
  negate() {
    return new Yt(this.X, N(-this.Y), this.Z);
  }
  double() {
    return this.add(this);
  }
  add(t) {
    let { X: n, Y: r, Z: a } = this, { X: i, Y: s, Z: m } = kr(t), u = 0n, f = 7n, h = 0n, y = 0n, k = 0n, D = N(f * 3n), w = N(n * i), x = N(r * s), g = N(a * m), T = N(n + r), S = N(i + s);
    T = N(T * S), S = N(w + x), T = N(T - S), S = N(n + a);
    let L = N(i + m);
    return S = N(S * L), L = N(w + g), S = N(S - L), L = N(r + a), h = N(s + m), L = N(L * h), h = N(x + g), L = N(L - h), k = N(u * S), h = N(D * g), k = N(h + k), h = N(x - k), k = N(x + k), y = N(h * k), x = N(w + w), x = N(x + w), g = N(u * g), S = N(D * S), x = N(x + g), g = N(w - g), g = N(u * g), S = N(S + g), w = N(x * S), y = N(y + w), w = N(L * S), h = N(T * h), h = N(h - w), w = N(T * x), k = N(L * k), k = N(k + w), new Yt(h, y, k);
  }
  subtract(t) {
    return this.add(kr(t).negate());
  }
  multiply(t, n = true) {
    if (!n && t === 0n) return rn;
    if (ii(t), t === 1n) return this;
    if (this.equals(Tt)) return ql(t).p;
    let r = rn, a = Tt, i = this;
    for (let s = 0; n ? s < 256 : t > 0n; s++) t & 1n ? r = r.add(i) : n && (a = a.add(i)), i = i.double(), t >>= 1n;
    return r;
  }
  multiplyUnsafe(t) {
    return this.multiply(t, false);
  }
  toAffine() {
    let { X: t, Y: n, Z: r } = this;
    if (r === 0n) return { x: 0n, y: 0n };
    if (r === 1n) return { x: t, y: n };
    let a = El(r, ut);
    if (N(r * a) !== 1n) throw new Error("inverse invalid");
    return { x: N(t * a), y: N(n * a) };
  }
  assertValidity() {
    let { x: t, y: n } = this.toAffine();
    if (nn(t), nn(n), N(n * n) !== ri(t)) throw new Error(xr);
    return this;
  }
  toBytes(t = true) {
    let { x: n, y: r } = this.assertValidity().toAffine(), a = Ze(n);
    return t ? $t(Dl(r), a) : $t(Uint8Array.of(4), a, Ze(r));
  }
  toHex(t) {
    return Xa(this.toBytes(t));
  }
}, Tt = new Ct(Wa, Ga, 1n), rn = new Ct(0n, 1n, 0n);
Ct.BASE = Tt, Ct.ZERO = rn;
var Ml = (e, t, n) => Tt.multiply(t, false).add(e.multiply(n, false)).assertValidity(), Pt = (e) => Ll("0x" + (Xa(e) || "0")), Rn = (e, t, n) => Pt(e.subarray(t, n)), Ze = (e) => Za(Ya(tn(e, 0n, 2n ** 256n), Ne * 2)), Al = (e) => {
  let t = Pt(Be(e, Ne, "secret key"));
  return tn(t, 1n, en, "invalid secret key: outside of range");
}, oi = "SHA-256", Rl = { hmacSha256Async: async (e, t) => {
  let n = Qa(), r = await n.importKey("raw", e, { name: "HMAC", hash: oi }, false, ["sign"]);
  return new Uint8Array(await n.sign("HMAC", r, t));
}, hmacSha256: void 0, sha256Async: async (e) => new Uint8Array(await Qa().digest(oi, e)), sha256: void 0 }, $l = (e) => {
  if (e = e === void 0 ? wr(48) : e, Be(e), e.length < 48 || e.length > 1024) throw new RangeError("expected 48-1024b");
  let t = N(Pt(e), en - 1n);
  return Ze(t + 1n);
}, Cl = (e) => (t) => {
  let n = $l(t);
  return { secretKey: n, publicKey: e(n) };
}, li = (e) => Uint8Array.from("BIP0340/" + e, (t) => t.charCodeAt(0)), Sr = (e, ...t) => {
  let n = ti("sha256", li(e));
  return ti("sha256", $t(n, n, ...t));
}, Tr = (e, ...t) => ni("sha256Async", li(e)).then((n) => ni("sha256Async", $t(n, n, ...t))), Pr = (e) => {
  let t = Al(e), n = Tt.multiply(t), { x: r, y: a } = n.assertValidity().toAffine(), i = An(a) ? t : Mn(-t), s = Ze(r);
  return { d: i, px: s };
}, Ir = (e) => Mn(Pt(e)), ci = (...e) => Ir(Sr("challenge", ...e)), di = async (...e) => Ir(await Tr("challenge", ...e)), ui = (e) => Pr(e).px, Bl = Cl(ui), mi = (e, t, n) => {
  let r = Il(e, "message"), { px: a, d: i } = Pr(t);
  return { m: r, px: a, d: i, a: Be(n, Ne) };
}, pi = (e) => {
  let t = Ir(e);
  if (t === 0n) throw new Error("sign failed: k is zero");
  let { px: n, d: r } = Pr(Ze(t));
  return { rx: n, k: r };
}, fi = (e, t, n, r) => $t(t, Ze(Mn(e + n * r))), gi = "invalid signature produced", Ol = (e, t, n = wr(Ne)) => {
  let { m: r, px: a, d: i, a: s } = mi(e, t, n), m = Ze(i ^ Pt(Sr("aux", s))), { rx: u, k: f } = pi(Sr("nonce", m, a, r)), h = fi(f, u, ci(u, a, r), i);
  if (!yi(h, r, a)) throw new Error(gi);
  return h;
}, jl = async (e, t, n = wr(Ne)) => {
  let { m: r, px: a, d: i, a: s } = mi(e, t, n), m = Ze(i ^ Pt(await Tr("aux", s))), { rx: u, k: f } = pi(await Tr("nonce", m, a, r)), h = fi(f, u, await di(u, a, r), i);
  if (!await vi(h, r, a)) throw new Error(gi);
  return h;
}, Hl = (e, t) => e instanceof Promise ? e.then(t) : t(e), hi = (e, t, n, r) => {
  let a = Be(e, 64, "signature"), i = Be(t, void 0, "message"), s = Be(n, Ne, "publicKey"), m, u, f, h;
  try {
    let y = Pt(s);
    m = si(y), u = nn(Rn(a, 0, Ne)), f = ii(Rn(a, Ne, 64)), h = $t(Ze(u), s, i);
  } catch {
    return false;
  }
  return Hl(r(h), (y) => {
    try {
      let { x: k, y: D } = Ml(m, f, Mn(-y)).toAffine();
      return !(!An(D) || k !== u);
    } catch {
      return false;
    }
  });
}, yi = (e, t, n) => hi(e, t, n, ci), vi = async (e, t, n) => hi(e, t, n, di), bi = br({ keygen: Bl, getPublicKey: ui, sign: Ol, verify: yi, signAsync: jl, verifyAsync: vi }), Ul = () => {
  let e = [], t = Tt, n = t;
  for (let r = 0; r < 33; r++) {
    n = t, e.push(n);
    for (let a = 1; a < 128; a++) n = n.add(t), e.push(n);
    t = n.double();
  }
  return e;
}, wi, ki = (e, t) => {
  let n = t.negate();
  return e ? n : t;
}, ql = (e) => {
  let t = wi || (wi = Ul()), n = rn, r = Tt;
  for (let a = 0; a < 33; a++) {
    let i = Number(e & 255n);
    e >>= 8n, i > 128 && (i -= 256, e += 1n);
    let s = a * 128, m = s + Math.abs(i) - 1, u = a % 2 !== 0, f = i < 0;
    i === 0 ? r = r.add(ki(u, t[s])) : n = n.add(ki(f, t[m]));
  }
  if (e !== 0n) throw new Error("invalid wnaf");
  return { p: n, f: r };
}, { floor: Lr, min: Fl, sin: zl } = Math, Ie = "Trystero", Er = (e, t) => Array(e).fill(void 0).map(t), _l = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz", It = (e) => Er(e, () => _l[Lr(Math.random() * 62)] ?? "").join(""), Oe = It(20), Lt = Promise.all.bind(Promise), xi = typeof window < "u", { entries: Bt, fromEntries: Si, keys: Ve, values: Qe } = Object, Se = () => {
}, Ti = "candidate", re = (e) => (e !== null && clearTimeout(e), null), Z = (e) => new Error(`${Ie}: ${e}`), Ot = (e, t) => e instanceof Error && e.message ? e.message : typeof e == "string" && e ? e : De(e ?? t), mt = (e, t) => e instanceof Error ? e : Z(Ot(e, t)), Nl = new TextEncoder(), Vl = new TextDecoder(), et = (e) => Nl.encode(e), Et = (e) => Vl.decode(e), an = (e) => e.reduce((t, n) => t + n.toString(16).padStart(2, "0"), ""), jt = (...e) => e.join("@"), Kl = (e, t) => {
  let n = [...e], r = () => {
    let i = zl(t++) * 1e4;
    return i - Lr(i);
  }, a = n.length;
  for (; a; ) {
    let i = Lr(r() * a--), s = n[a];
    n[a] = n[i], n[i] = s;
  }
  return n;
}, Wl = (e, t, n, r = false) => e.relayConfig?.urls || (r ? Kl(t, Pi(e.appId)) : t).slice(0, e.relayConfig?.redundancy ?? n), De = JSON.stringify, sn = (e) => {
  try {
    return JSON.parse(e);
  } catch {
    throw Z(`failed to parse JSON: ${e}`);
  }
}, Pi = (e, t = Number.MAX_SAFE_INTEGER) => e.split("").reduce((n, r) => n + r.charCodeAt(0), 0) % t, Ii = 3333, Gl = 6e4, Dr = {}, on = null, Mr = null, Jl = () => {
  on || (on = new Promise((e) => {
    Mr = e;
  }).finally(() => {
    Mr = null, on = null;
  }));
}, Yl = () => {
  Mr?.();
}, Xl = (e, t, n) => {
  let r = {}, a = false, i = false, s, m = Se;
  r.isClosed = false, r.ready = new Promise((f) => m = f);
  let u = () => {
    if (r.isClosed) return;
    s = void 0, i = false;
    let f = new WebSocket(e);
    f.onclose = () => {
      if (r.isClosed || i) return;
      if (i = true, on) {
        on.then(u);
        return;
      }
      let h = Dr[e] ??= Ii;
      s = setTimeout(u, Math.random() * h), Dr[e] = Fl(h * 2, Gl);
    }, f.onmessage = (h) => t(String(h.data)), r.socket = f, r.url = f.url, f.onopen = () => {
      let h = a;
      a = true, m(r), Dr[e] = Ii, h && n?.();
    }, r.send = (h) => {
      f.readyState === 1 && f.send(h);
    };
  };
  return r.close = () => {
    r.isClosed = true, s !== void 0 && (clearTimeout(s), s = void 0), r.socket.close();
  }, u(), r;
}, Zl = (e) => {
  let t = {}, n = /* @__PURE__ */ new WeakMap(), r = (s) => {
    let m = n.get(s);
    if (!m) throw Z("relay bookkeeping missing registration for relay client");
    return m;
  }, a = () => {
    let s = {}, m = (u) => s[u] ??= {};
    return { forKey: m, forRelay: (u) => m(r(u)) };
  }, i = (s, m) => (t[s] = m, n.set(m, s), m);
  return { register: (s, m) => t[s] || i(s, m()), keyOf: r, scoped: a, getSockets: () => Si(Bt(t).flatMap(([s, m]) => {
    let u = e(m);
    return u ? [[s, u]] : [];
  })) };
}, Ql = () => {
  if (xi) {
    let e = new AbortController();
    return addEventListener("online", Yl, { signal: e.signal }), addEventListener("offline", Jl, { signal: e.signal }), () => e.abort();
  }
  return Se;
}, Ar = "AES-GCM", ec = {}, tc = (e) => btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(e)))), nc = (e) => {
  let t = atob(e);
  return new Uint8Array(t.length).map((n, r) => t.charCodeAt(r)).buffer;
}, $n = async (e, t) => new Uint8Array(await crypto.subtle.digest(e, et(t))), Ht = async (e) => ec[e] ??= Array.from(await $n("SHA-1", e)).map((t) => t.toString(36)).join(""), rc = async (e, t, n) => crypto.subtle.importKey("raw", await crypto.subtle.digest({ name: "SHA-256" }, et(`${e}:${t}:${n}`)), { name: Ar }, false, ["encrypt", "decrypt"]), ac = async (e, t) => an(await $n("SHA-256", `${Ie}:${e}:${t}`)), Li = "$", Ei = ",", ic = async (e, t) => {
  let n = crypto.getRandomValues(new Uint8Array(16));
  return n.join(Ei) + Li + tc(await crypto.subtle.encrypt({ name: Ar, iv: n }, await e, et(t)));
}, sc = async (e, t) => {
  let [n, r] = t.split(Li);
  return Et(await crypto.subtle.decrypt({ name: Ar, iv: new Uint8Array(n?.split(Ei).map(Number) ?? []) }, await e, nc(r ?? "")));
}, oc = 18e4, lc = class {
  makeOffer;
  leased = /* @__PURE__ */ new Map();
  destroyed = false;
  constructor(e) {
    this.makeOffer = e;
  }
  claimLeased(e) {
    let t = this.leased.get(e);
    t && (re(t), this.leased.delete(e));
  }
  reclaimLeased(e) {
    this.leased.has(e) && (this.claimLeased(e), e.destroy());
  }
  checkout(e, t, n) {
    let r = async (a = false) => {
      if (this.destroyed) throw Z("room left while preparing offer");
      let i = this.makeOffer();
      try {
        let s = await n(i);
        if (this.destroyed) throw Z("room left while preparing offer");
        return t ? (this.leased.set(i, setTimeout(() => {
          this.leased.delete(i), i.destroy();
        }, oc)), { peer: i, offer: s, claim: () => this.claimLeased(i), reclaim: () => this.reclaimLeased(i) }) : { peer: i, offer: s };
      } catch (s) {
        if (i.destroy(), !a && !this.destroyed) return r(true);
        throw s;
      }
    };
    return Lt(Er(e, () => r()));
  }
  getOffers(e, t) {
    return this.checkout(e, true, t);
  }
  destroy() {
    this.destroyed = true, this.leased.forEach((e, t) => {
      re(e), t.destroy();
    }), this.leased.clear();
  }
}, Rr = Z("incorrect password for overlapping room"), cc = (e, t, n) => {
  let r = (i) => $n("SHA-256", `${i}:${e}:${t}:${n}`).then(an), a = async (i, s, m) => {
    if (!e) return;
    if (m) {
      let f = It(36);
      await i({ __trystero_pw: "challenge", c: f });
      let { data: h } = await s();
      if (!h || typeof h != "object" || h.__trystero_pw !== "response" || typeof h.h != "string") throw Rr;
      let y = await r(f);
      if (h.h !== y) throw Rr;
      return;
    }
    let { data: u } = await s();
    if (!u || typeof u != "object" || u.__trystero_pw !== "challenge" || typeof u.c != "string") throw Rr;
    await i({ __trystero_pw: "response", h: await r(u.c) });
  };
  return { run: a, compose: (i) => e || i ? async (s, m, u, f) => {
    await a(m, u, f), await i?.(s, m, u, f);
  } : void 0 };
}, dc = (e) => {
  let t = Ot(e, "unknown error");
  return t.startsWith("handshake ") ? t : `handshake failed: ${t}`;
}, uc = ({ onPeerHandshake: e, onHandshakeError: t, handshakeTimeoutMs: n, sendHandshakeData: r, sendHandshakeReady: a, onActivate: i, onFailure: s }) => {
  let m = {}, u = (y, k) => {
    let D = m[y];
    !D || k && D.peer !== k || D.isActive || !D.didLocalHandshakePass || !D.didReceiveRemoteReady || (D.isActive = true, D.handshakeTimer = re(D.handshakeTimer), i(y, D.peer));
  }, f = (y, k, D) => {
    let w = m[y];
    if (!w || w.peer !== k) return;
    let x = dc(D);
    t?.(y, x), s(y, k, Z(x));
  }, h = (y, k) => {
    let D = m[y];
    !D || D.peer !== k || D.isActive || (D.didLocalHandshakePass = true, a("", y).catch((w) => f(y, k, Z(`failed sending handshake readiness: ${Ot(w, "unknown send failure")}`))), u(y, k));
  };
  return { addPeer: (y, k) => {
    m[y] = { peer: k, isActive: false, didLocalHandshakePass: false, didReceiveRemoteReady: false, handshakeTimer: null, pendingHandshakePayloads: [], handshakeWaiters: [] };
  }, clearPeer: (y, k) => {
    let D = m[y];
    D && (D.handshakeTimer = re(D.handshakeTimer), D.pendingHandshakePayloads.length = 0, D.handshakeWaiters.splice(0).forEach((w) => w.reject(k)), delete m[y]);
  }, canReceiveFromPeer: (y, k) => {
    let D = m[y];
    return !!(D && (D.isActive || k));
  }, start: (y, k) => {
    let D = m[y];
    if (!D || D.peer !== k) return;
    D.handshakeTimer = setTimeout(() => f(y, k, Z(`handshake timed out after ${n}ms`)), n);
    let w = async (T, S) => {
      await r(T, y, S);
    }, x = () => new Promise((T, S) => {
      let L = m[y];
      if (!L || L.peer !== k) {
        S(Z("peer disconnected during handshake"));
        return;
      }
      let C = L.pendingHandshakePayloads.shift();
      if (C) {
        T(C);
        return;
      }
      L.handshakeWaiters.push({ resolve: T, reject: (G) => S(G) });
    }), g = Oe < y;
    Promise.resolve(e?.(y, w, x, g)).then(() => h(y, k)).catch((T) => f(y, k, mt(T, "handshake failed")));
  }, receiveHandshakeData: (y, k, D) => {
    let w = m[k];
    if (!w || w.isActive) return;
    let x = D === void 0 ? { data: y } : { data: y, metadata: D }, g = w.handshakeWaiters.shift();
    if (g) {
      g.resolve(x);
      return;
    }
    if (w.pendingHandshakePayloads.length >= 16) {
      f(k, w.peer, Z("too many pending handshake messages"));
      return;
    }
    w.pendingHandshakePayloads.push(x);
  }, receiveHandshakeReady: (y) => {
    let k = m[y];
    !k || k.isActive || (k.didReceiveRemoteReady = true, u(y));
  } };
}, mc = 15e3, pc = 150, fc = 5e3, Di = "icecandidate", Mi = "icegatheringstatechange", gc = "iceconnectionstatechange", ln = "offer", hc = "answer", yc = /out of range/i, vc = 128, bc = 8192, Ai = (e) => e.replace(/ (\S+\.local) (\d+) typ host/g, " 127.0.0.1 $2 typ host"), Ri = (e, { trickleIce: t, rtcConfig: n, rtcPolyfill: r, turnConfig: a, _test_only_mdnsHostFallbackToLoopback: i }) => {
  let s = new (r ?? RTCPeerConnection)({ iceServers: $i.concat(a ?? []), ...n }), m = {}, u = /* @__PURE__ */ new Set(), f = [], h = [], y = null, k = t !== false, D = [], w = [], x, g = false, T = false, S = null, L = null, C = false, G = (o) => {
    x && (x(o), x = void 0);
  }, te = () => L = re(L), ae = () => {
    C || (C = true, u.forEach((o) => o()), y = re(y), h.length = 0, te(), m.close?.());
  }, Y = (o) => {
    o.type === ln && (G(o), !m.signal && !s.remoteDescription) || (m.signal ? m.signal(o) : f.push(o));
  }, ie = (o) => {
    let d = m.signal;
    m.signal = (b) => {
      d?.(b), o(b);
    }, f.length > 0 && f.splice(0).forEach((b) => m.signal?.(b));
  }, fe = (o) => i ? Ai(o) : o, se = (o) => {
    if (!i || typeof o.candidate != "string") return o;
    let d = Ai(o.candidate);
    return d === o.candidate ? o : { ...o, candidate: d };
  }, z = (o) => ({ type: o.localDescription?.type ?? ln, sdp: fe(o.localDescription?.sdp ?? "") }), p = () => {
    let o = s.remoteDescription?.sdp;
    return o ? o.match(/a=ice-ufrag:([^\s]+)/)?.[1] ?? null : null;
  }, E = () => (s.remoteDescription?.sdp?.match(/^m=/gm) ?? []).length, R = (o) => {
    if (!s.remoteDescription) return false;
    let d = E();
    if (typeof o.sdpMLineIndex == "number" && d > 0 && o.sdpMLineIndex >= d) return false;
    let b = p();
    return !(b && o.usernameFragment && o.usernameFragment !== b);
  }, j = async (o) => {
    try {
      return await s.addIceCandidate(o), true;
    } catch (d) {
      if (d instanceof Error && yc.test(d.message) && typeof o.sdpMLineIndex == "number") return false;
      throw d;
    }
  }, _ = (o) => {
    D.length >= vc && D.shift(), D.push(o);
  }, O = async () => {
    if (!s.remoteDescription || D.length === 0) return;
    let o = p(), d = D.splice(0), b = [];
    for (let A of d) if (!(o && A.usernameFragment && A.usernameFragment !== o)) {
      if (!R(A)) {
        b.push(A);
        continue;
      }
      await j(A) || b.push(A);
    }
    b.forEach(_);
  }, P = async (o) => {
    if (R(o)) {
      await j(o) || _(o);
      return;
    }
    _(o);
  }, M = (o) => {
    o.binaryType = "arraybuffer", o.bufferedAmountLowThreshold = 65535;
    let d = () => {
      console.warn(`${Ie}: invalid or excessive data before handler registration; disconnecting peer`), o.close(), s.close(), ae();
    };
    o.onmessage = (b) => {
      let A = b.data;
      if (!C) {
        if (!(A instanceof ArrayBuffer) && !ArrayBuffer.isView(A) || A.byteLength > 16515) {
          d();
          return;
        }
        if (m.data) m.data(A);
        else {
          if (h.length >= 64) {
            d();
            return;
          }
          y || (y = setTimeout(d, 1e4)), h.push(A);
        }
      }
    }, o.onopen = () => m.connect?.(), o.onclose = ae, o.onerror = ({ error: b }) => {
      C || b?.errorDetail === "sctp-failure" && (b.sctpCauseCode === 12 || /^User-Initiated Abort\b/.test(b.message)) || m.error?.(mt(b, "data channel error"));
    };
  }, q = n?.iceServers ?? $i.concat(a ?? []), J = (o) => q.some(({ urls: d }) => (Array.isArray(d) ? d : [d]).some((b) => o.test(b))), ue = J(/^turns?:/i), Q = !ue && J(/^stuns?:/i), be = ue ? /\btyp relay\b/ : Q ? /\btyp (?:srflx|relay|prflx)\b/ : /\btyp (?:host|srflx|relay|prflx)\b/, we = async (o) => (await new Promise((d) => {
    let b = null, A = null, B = () => {
      re(b), re(A), o.removeEventListener(Mi, $), o.removeEventListener(Di, U), u.delete(B), d();
    }, F = (ee = "") => {
      let de = `${o.localDescription?.sdp ?? ""}
${ee}`;
      be.test(de) && (re(A), A = setTimeout(B, pc));
    }, $ = () => {
      o.iceGatheringState === "complete" || C ? B() : F();
    }, U = (ee) => {
      let { candidate: de } = ee;
      de ? F(de.candidate) : B();
    };
    u.add(B), b = setTimeout(B, mc), o.addEventListener(Mi, $), o.addEventListener(Di, U), $();
  }), z(o)), Pe = async () => {
    let o = k ? z(s) : await we(s);
    return C || Y(o), o;
  };
  e ? (S = s.createDataChannel("data"), M(S)) : s.ondatachannel = ({ channel: o }) => {
    S = o, M(o);
  };
  let Ce = async (o = false) => {
    if (s.connectionState === "closed" || !o && (g || s.signalingState !== "stable")) {
      s.connectionState === "closed" && G();
      return;
    }
    try {
      return g = true, o && (s.remoteDescription && s.signalingState !== "stable" && s.signalingState !== "closed" && s.localDescription?.type === ln && await s.setLocalDescription({ type: "rollback" }), typeof s.restartIce == "function" && s.restartIce()), await s.setLocalDescription(o ? await s.createOffer({ iceRestart: true }) : void 0), await Pe();
    } catch (d) {
      o || G(), m.error?.(mt(d, "failed to create local offer"));
    } finally {
      g = false;
    }
  };
  s.onnegotiationneeded = async () => Ce(false), s.onicecandidate = ({ candidate: o }) => {
    if (!k || !o) return;
    let d = se(typeof o.toJSON == "function" ? o.toJSON() : { candidate: o.candidate, sdpMid: o.sdpMid, sdpMLineIndex: o.sdpMLineIndex, usernameFragment: o.usernameFragment });
    Y({ type: Ti, sdp: JSON.stringify(d) });
  };
  let qe = () => {
    if (s.connectionState === "failed" || s.connectionState === "closed" || s.iceConnectionState === "failed" || s.iceConnectionState === "closed") {
      ae();
      return;
    }
    if (s.connectionState === "connected" || s.connectionState === "connecting" || s.iceConnectionState === "connected" || s.iceConnectionState === "completed" || s.iceConnectionState === "checking") {
      te();
      return;
    }
    if (s.connectionState === "disconnected" || s.iceConnectionState === "disconnected") {
      L || (L = setTimeout(() => {
        L = null, (s.connectionState === "disconnected" || s.iceConnectionState === "disconnected") && ae();
      }, fc));
      return;
    }
  };
  s.onconnectionstatechange = qe, s.addEventListener(gc, qe), s.ontrack = (o) => {
    let d = o.streams[0];
    if (d) {
      if (!m.track && !m.stream) {
        w.push({ track: o.track, stream: d });
        return;
      }
      m.track?.(o.track, d), m.stream?.(d);
    }
  };
  let Me = e ? new Promise((o) => {
    x = o;
  }) : Promise.resolve();
  return e && queueMicrotask(() => {
    !g && s.signalingState === "stable" && !s.localDescription && s.connectionState !== "closed" && s.onnegotiationneeded?.(new Event("negotiationneeded"));
  }), { connection: s, get channel() {
    return S;
  }, get isDead() {
    return s.connectionState === "closed";
  }, getOffer: async (o = false) => {
    if (e) return o ? Ce(true) : x ? Me : s.localDescription?.type === ln ? k ? z(s) : we(s) : Me;
  }, async signal(o) {
    if (o.type === "candidate") {
      if (o.sdp.length > bc) return;
      try {
        let d = JSON.parse(o.sdp);
        d && typeof d == "object" && await P(se(d));
      } catch (d) {
        m.error?.(mt(d, "failed to parse remote candidate"));
      }
      return;
    }
    if (!(S?.readyState === "open" && !o.sdp?.includes("a=rtpmap"))) try {
      let d = { ...o, sdp: fe(o.sdp) };
      if (o.type === ln) {
        let b = g || s.signalingState !== "stable" && !T;
        return b && e ? void 0 : (b && s.signalingState !== "stable" ? await Lt([s.setLocalDescription({ type: "rollback" }), s.setRemoteDescription(d)]) : await s.setRemoteDescription(d), await O(), await s.setLocalDescription(), await Pe());
      }
      if (o.type === hc) {
        T = true;
        try {
          await s.setRemoteDescription(d), await O();
        } finally {
          T = false;
        }
      }
    } catch (d) {
      m.error?.(mt(d, "failed to apply remote signal"));
    }
  }, sendData: (o) => S?.send(o), destroy: () => {
    te(), G(), S?.close(), s.close(), g = false, T = false, ae();
  }, setHandlers: (o) => {
    let { signal: d, ...b } = o;
    Object.assign(m, b), m.data && h.length > 0 && (y = re(y), h.splice(0).forEach((A) => m.data?.(A))), d && ie(d), (m.track || m.stream) && w.length > 0 && w.splice(0).forEach(({ track: A, stream: B }) => {
      m.track?.(A, B), m.stream?.(B);
    });
  }, addStream: (o) => o.getTracks().forEach((d) => s.addTrack(d, o)), removeStream: (o) => s.getSenders().filter((d) => d.track && o.getTracks().includes(d.track)).forEach((d) => s.removeTrack(d)), addTrack: (o, d) => s.addTrack(o, d), removeTrack: (o) => {
    let d = s.getSenders().find((b) => b.track === o);
    d && s.removeTrack(d);
  }, replaceTrack: (o, d) => {
    let b = s.getSenders().find((A) => A.track === o);
    if (b) return b.replaceTrack(d);
  } };
}, $i = [...Er(3, (e, t) => `stun:stun${t || ""}.l.google.com:19302`), "stun:stun.cloudflare.com:3478"].map((e) => ({ urls: e })), wc = 1024, kc = 64, xc = 128, Sc = 8, Tc = new Uint8Array(), Pc = (e, t) => {
  let n;
  try {
    n = e();
  } catch {
    return t(false);
  }
  return typeof n == "boolean" ? t(n) : Promise.resolve(n).then((r) => t(r === true), () => t(false));
}, Ci = (e, t, n) => t === 2 ? n ? e.slice() : e : t === 1 ? sn(Et(e)) : Et(e), Bi = (e, t, n, r) => {
  try {
    e.progress(t, n, r);
  } catch (a) {
    console.error(`${Ie} progress handler error:`, a);
  }
}, Oi = (e, t, n, r) => {
  Bi(e, 1, n, r);
  try {
    e.receiver?.(t, n, r);
  } catch (a) {
    console.error(`${Ie} action handler error:`, a);
  }
}, Ic = ({ fail: e, accept: t, refuse: n, maxReceiveBytes: r, chunkSize: a }) => {
  let i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), m = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Map(), f = 0, h = 0, y = 0, k = false, D = false, w = (p) => p.phase !== "released", x = (p) => Math.min(r, p?.maxPayloadBytes ?? r), g = (p, E, R, j) => {
    R?.reject(E), i.get(p.type)?.reject?.(p.peerId, p.metadata, E), j !== void 0 && n(p.peerId, j, E);
  }, T = (p) => {
    for (let E of Array.from(m)) E.peerId === p && (m.delete(E), m.add(E));
  }, S = (p) => {
    if (!w(p)) return;
    p.phase = "released", p.removeAbortListener?.(), p.timer = re(p.timer);
    let E = s.get(p.peerId);
    if (p.kind === "inline") {
      let R = E.inline.get(p.key);
      R.splice(R.indexOf(p), 1), R.length || E.inline.delete(p.key), p.data = Tc;
    } else E.bulk.delete(p.id), m.delete(p), p.data = null, p.transfer === "receiving" && (y -= p.size, E.active === p && (E.active = null, T(p.peerId)), D = true);
    E.count--, f--, E.count || s.delete(p.peerId), p.controller?.abort();
  }, L = (p, E) => {
    w(p) && (S(p), g(p, E, p.scope, p.kind === "bulk" ? p.id : void 0));
  }, C = (p, E) => {
    if (p.phase !== "pending") return p.phase === "ready";
    if (p.size > x(E)) return L(p, "payload exceeds receiver size limit"), false;
    let R = p.scope ? p.scope.receive : E.receive;
    if (!R) return E.receiver ? (p.phase = "ready", true) : false;
    if (h >= xc || (u.get(p.peerId) ?? 0) >= Sc) return L(p, "too many pending receive decisions"), false;
    p.phase = "deciding";
    let j = new AbortController();
    p.controller = j, h++, u.set(p.peerId, (u.get(p.peerId) ?? 0) + 1);
    let _ = Pc(() => R({ byteLength: p.size, peerId: p.peerId, signal: j.signal, ...p.metadata === void 0 ? {} : { metadata: p.metadata } }), (O) => {
      h--;
      let P = u.get(p.peerId) - 1;
      return P ? u.set(p.peerId, P) : u.delete(p.peerId), w(p) ? (O ? p.phase = "ready" : L(p, "payload rejected by receiver"), O) : false;
    });
    return typeof _ == "boolean" ? _ : (_.then(() => ie()), false);
  }, G = (p, E, R) => {
    let j;
    try {
      j = Ci(R, p.format, p.kind === "inline");
    } catch {
      S(p), e(p.peerId, "invalid action payload");
      return;
    }
    S(p), Oi(E, j, p.peerId, p.metadata);
  }, te = (p) => {
    let E = i.get(p.type);
    w(p) && E && C(p, E) && E.receiver && G(p, E, p.data);
  }, ae = (p) => {
    let E = i.get(p.type);
    if (!w(p) || !E || !C(p, E) || !E.receiver) return;
    if (p.transfer === "receiving") {
      p.offset === p.size && G(p, E, p.data);
      return;
    }
    let R = s.get(p.peerId);
    !R.active && y + p.size <= r && (R.active = p, p.transfer = "receiving", y += p.size, p.lastSeen = Date.now(), m.delete(p), t(p.peerId, p.id));
  }, Y = (p, E) => {
    let R = s.get(p)?.inline.get(E);
    for (; R?.[0]; ) {
      let j = R[0];
      if (te(j), w(j)) break;
    }
  }, ie = () => {
    if (k) {
      D = true;
      return;
    }
    k = true;
    try {
      do {
        D = false;
        for (let p of m) ae(p);
        for (let [p, E] of s) {
          for (let R of E.bulk.values()) R.offset === R.size && ae(R);
          for (let R of E.inline.keys()) Y(p, R);
        }
      } while (D);
    } finally {
      k = false;
    }
  }, fe = (p) => {
    let E = s.get(p.peerId);
    if (f >= wc || (E?.count ?? 0) >= kc) return g(p, "too many pending transfers", p.scope, p.kind === "bulk" ? p.id : void 0), false;
    if (E || (E = { bulk: /* @__PURE__ */ new Map(), inline: /* @__PURE__ */ new Map(), active: null, count: 0 }, s.set(p.peerId, E)), E.count++, f++, p.kind === "inline") {
      let j = E.inline.get(p.key) ?? [];
      j.push(p), E.inline.set(p.key, j);
    } else E.bulk.set(p.id, p), m.add(p);
    let R = () => {
      let j = 12e4 - (Date.now() - p.lastSeen);
      j > 0 ? p.timer = setTimeout(R, j) : (L(p, "action transfer timed out"), ie());
    };
    if (p.timer = setTimeout(R, 12e4), p.scope) {
      let { signal: j } = p.scope, _ = () => {
        L(p, "receive cancelled"), ie();
      };
      if (j.addEventListener("abort", _, { once: true }), p.removeAbortListener = () => j.removeEventListener("abort", _), j.aborted) return _(), false;
    }
    return true;
  }, se = (p, E) => {
    let R = i.get(p.type), j = R?.receiveScope?.(p.peerId, p.metadata);
    return j === null || j?.signal.aborted ? (E !== void 0 && n(p.peerId, E, "unexpected response"), null) : p.size > x(R) ? (g(p, "payload exceeds receiver size limit", j, E), null) : { action: R, scope: j };
  }, z = (p, E) => ({ ...p, ...E ? { scope: E } : {}, phase: "pending", controller: null, lastSeen: Date.now(), timer: null });
  return { register: (p, E = {}) => {
    let R = { ...E, receiver: null, receive: null, reject: null, progress: Se };
    return i.set(p, R), { onMessage: (j) => {
      R.receiver = j, ie();
    }, onReceive: (j) => {
      R.receive = j, ie();
    }, onReject: (j) => {
      R.reject = j;
    }, onProgress: (j) => {
      R.progress = j;
    } };
  }, receiveInline: (p, E) => {
    let R = se(p);
    if (!R) return;
    let { action: j, scope: _ } = R, O = _ ? `${p.type}\0${_.key}` : p.type;
    if (j?.receiver && !(_ ? _.receive : j.receive) && !s.get(p.peerId)?.inline.has(O)) {
      let M;
      try {
        M = Ci(E, p.format, true);
      } catch {
        e(p.peerId, "invalid action payload");
        return;
      }
      Oi(j, M, p.peerId, p.metadata);
      return;
    }
    let P = { ...z(p, _), kind: "inline", key: O, data: E };
    fe(P) && Y(p.peerId, O);
  }, receiveOffer: (p, E) => {
    if (s.get(p.peerId)?.bulk.has(E)) {
      e(p.peerId, "duplicate action offer");
      return;
    }
    let R = se(p, E);
    if (!R) return;
    let j = { ...z(p, R.scope), kind: "bulk", id: E, transfer: "waiting", offset: 0, data: null };
    fe(j) && ie();
  }, receiveChunk: (p, E, R, j) => {
    let _ = s.get(p), O = _?.bulk.get(E);
    if (!O) return;
    if (O.transfer !== "receiving" || R !== O.offset || !j.length || j.length !== Math.min(a, O.size - O.offset)) {
      e(p, "invalid action chunk offset or length");
      return;
    }
    try {
      O.data ??= new Uint8Array(O.size);
    } catch {
      L(O, "unable to allocate receive buffer"), ie();
      return;
    }
    O.data.set(j, O.offset), O.offset += j.length;
    let P = Date.now();
    O.lastSeen = P;
    for (let M of m) M.phase === "ready" && i.get(M.type)?.receiver && (M.lastSeen = P);
    O.offset === O.size ? (ae(O), w(O) && _?.active === O && (_.active = null, T(p)), ie()) : Bi(i.get(O.type), O.offset / O.size, p, O.metadata);
  }, cancel: (p, E) => {
    let R = s.get(p)?.bulk.get(E);
    R && (S(R), R.scope?.reject("response cancelled by sender")), ie();
  }, clearPeer: (p) => {
    let E = s.get(p);
    if (E) {
      for (let R of E.bulk.values()) S(R);
      for (let R of E.inline.values()) {
        let j = [...R];
        for (let _ of j) S(_);
      }
    }
    ie();
  } };
}, $r = 2, Cn = 0, Bn = 1, ji = 2, Cr = 3, Br = 4, On = 5, Or = 36, Hi = 48, pt = 6, cn = 14, jr = 16384 - cn, Lc = 256 * 1024 ** 2, Ui = 1024 ** 2, qi = "bufferedamountlow", Fi = "close", zi = "error", Ec = 1e4, ft = (e, t) => {
  let n = Z(t);
  return n.kind = e, n.name = e === "aborted" ? "AbortError" : n.name, n;
}, Hr = (e) => {
  if (e?.aborted) throw ft("aborted", "operation aborted");
}, _i = (e, t, n = pt) => {
  let r = new Uint8Array(n);
  return r[0] = $r, r[1] = e, new DataView(r.buffer).setUint32(2, t), r;
}, Ut = ft, Dc = (e, t, n = Ec) => e.readyState !== "open" || e.bufferedAmount <= e.bufferedAmountLowThreshold ? Promise.resolve(e.readyState === "open") : new Promise((r) => {
  let a = false, i = null, s = (f) => {
    a || (a = true, e.removeEventListener(qi, m), e.removeEventListener(Fi, u), e.removeEventListener(zi, u), t?.removeEventListener("abort", u), re(i), r(f));
  }, m = () => s(true), u = () => s(false);
  if (e.addEventListener(qi, m), e.addEventListener(Fi, u), e.addEventListener(zi, u), t?.addEventListener("abort", u, { once: true }), i = setTimeout(() => s(false), n), e.readyState !== "open" || t?.aborted) {
    s(false);
    return;
  }
  e.bufferedAmount <= e.bufferedAmountLowThreshold && s(true);
}), Mc = ({ getPeer: e, getPeerIds: t, canReceiveFromPeer: n, onPeerError: r, throwIfAborted: a = Hr, maxReceiveBytes: i = Lc }) => {
  if (!Number.isSafeInteger(i) || i <= 0) throw Z("maxReceiveBytes must be a positive safe integer");
  let s = /* @__PURE__ */ new Map(), m = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new WeakSet(), f = 0, h = Ic({ fail: (w, x) => k(w, x), accept: (w, x) => D(w, x, Cr), refuse: (w, x, g) => D(w, x, Br, g), maxReceiveBytes: i, chunkSize: jr }), y = (w) => {
    for (let x of m.get(w)?.values() ?? []) x.fail(Ut("disconnected", "peer disconnected"));
    m.delete(w), h.clearPeer(w);
  }, k = (w, x) => {
    let g = e(w, true);
    g && !u.has(g) && (u.add(g), console.warn(`${Ie}: ${x}; disconnecting peer ${w}`), r(w, Z(x)));
  }, D = (w, x, g, T = "") => {
    let S = e(w, true);
    if (!S) return;
    let L = et(T).subarray(0, 200), C = _i(g, x, pt + L.length);
    C.set(L, pt);
    try {
      if ((S.channel?.bufferedAmount ?? 0) > Ui) throw Z("control send buffer is full");
      S.sendData(C);
    } catch {
      k(w, "unable to send action control");
    }
  };
  return { makeInternalAction: (w, x = {}) => {
    let g = { sendToPending: !!x.sendToPending, receiveWhilePending: !!x.receiveWhilePending, ...x.maxPayloadBytes === void 0 ? {} : { maxPayloadBytes: x.maxPayloadBytes }, ...x.receiveScope ? { receiveScope: x.receiveScope } : {} }, T = s.get(w);
    if (T) {
      if (T.options.sendToPending !== g.sendToPending || T.options.receiveWhilePending !== g.receiveWhilePending || T.options.receiveScope !== g.receiveScope || T.options.maxPayloadBytes !== g.maxPayloadBytes) throw Z(`action type "${w}" cannot be redefined`);
      return T.action;
    }
    let S = et(w);
    if (!w || w.includes("\0") || S.length > 32) throw Z("action type must contain 1–32 UTF-8 bytes and no null characters");
    let L = { options: g, action: { ...h.register(w, g), send: async (C, G, te, ae, Y) => {
      if (a(Y), C === void 0) throw Z("action data cannot be undefined");
      let ie = C instanceof Blob, fe = ie || C instanceof ArrayBuffer || ArrayBuffer.isView(C), se = fe ? 2 : typeof C == "string" ? 0 : 1, z = ie ? C : C instanceof ArrayBuffer ? new Uint8Array(C) : ArrayBuffer.isView(C) ? new Uint8Array(C.buffer, C.byteOffset, C.byteLength) : et(se === 0 ? C : De(C)), p = z instanceof Blob ? z.size : z.byteLength, E = te === void 0 ? new Uint8Array() : et(De(te));
      if (E.length > 16336) throw Z("action metadata is too large");
      let R = Or + E.length + p <= 16384;
      !R && fe && !(z instanceof Blob) && (z = z.slice());
      let j = R ? 0 : f++ >>> 0, _ = R ? Or : Hi, O = new Uint8Array(_ + E.length + (R ? p : 0));
      O[0] = $r, O[1] = (R ? Cn : Bn) | se << 4, O.set(S, 2);
      let P = new DataView(O.buffer);
      P.setUint16(34, E.length), R || (P.setUint32(36, j), P.setFloat64(40, p)), O.set(E, _), R && O.set(z instanceof Blob ? new Uint8Array(await z.arrayBuffer()) : z, _ + E.length);
      let M = G ? Array.isArray(G) ? G : [G] : t(g.sendToPending);
      await Lt([...new Set(M)].map(async (q) => {
        let J = e(q, g.sendToPending);
        if (!J) {
          console.warn(`${Ie}: no peer with id ${q} found`);
          return;
        }
        let ue = null, Q = () => {
          if (ue) throw ue;
          if (a(Y), e(q, g.sendToPending) !== J || J.channel?.readyState === "closed") throw Ut("disconnected", "peer disconnected");
        }, be = async ($) => {
          Q();
          let U = J.channel;
          if (U && (U.readyState !== "open" || U.bufferedAmount > U.bufferedAmountLowThreshold)) {
            if (!await Dc(U, Y)) throw a(Y), Ut("disconnected", "data channel stopped draining");
            Q();
          }
          try {
            J.sendData($);
          } catch {
            throw Ut("disconnected", "peer disconnected");
          }
        };
        if (R) {
          await be(O), ae?.(1, q, te);
          return;
        }
        let we = false, Pe = false, Ce = Date.now(), qe, Me, o = new Promise(($, U) => {
          qe = $, Me = U;
        });
        o.catch(Se);
        let d = m.get(q) ?? /* @__PURE__ */ new Map();
        if (d.has(j)) throw Z("action transmission id is still in use");
        m.set(q, d);
        let b = null, A = { accept: () => !b || ue ? false : (b = re(b), qe(), true), fail: ($, U = false) => {
          U && (Pe = true), ue = $, Me($);
        }, touch: () => {
          b && (Ce = Date.now());
        } };
        d.set(j, A);
        let B = () => {
          let $ = 12e4 - (Date.now() - Ce);
          $ > 0 ? b = setTimeout(B, $) : A.fail(Ut("timeout", "action offer timed out"));
        };
        b = setTimeout(B, 12e4);
        let F = () => {
          try {
            a(Y);
          } catch ($) {
            A.fail($);
          }
        };
        Y?.addEventListener("abort", F, { once: true });
        try {
          await be(O), we = true, await o;
          for (let $ = 0; $ < p; $ += jr) {
            Q();
            let U = Math.min(jr, p - $), ee = _i(ji, j, cn + U);
            new DataView(ee.buffer).setFloat64(pt, $), ee.set(z instanceof Blob ? new Uint8Array(await z.slice($, $ + U).arrayBuffer()) : z.subarray($, $ + U), cn), await be(ee);
            for (let de of d.values()) de.touch();
            ae?.(($ + U) / p, q, te);
          }
          Q();
        } catch ($) {
          throw we && !Pe && e(q, true) === J && (!J.channel || J.channel.readyState === "open" && (J.channel.bufferedAmount ?? 0) <= Ui) && D(q, j, On), $;
        } finally {
          b = re(b), Y?.removeEventListener("abort", F), d.delete(j), !d.size && m.get(q) === d && m.delete(q);
        }
      }));
    } } };
    return s.set(w, L), L.action;
  }, handleData: (w, x) => {
    if (x.byteLength < 2 || x.byteLength > 16384) {
      k(w, "invalid action frame");
      return;
    }
    let g = new Uint8Array(x);
    if (g[0] !== $r) {
      k(w, "incompatible action protocol version");
      return;
    }
    let T = g[1] & 15, S = g[1] >>> 4, L = new DataView(g.buffer, g.byteOffset, g.byteLength);
    if (T > On || S > 2 || T > Bn && S !== 0) {
      k(w, "invalid action frame");
      return;
    }
    if (T >= ji) {
      if (g.length < pt || (T === Cr || T === On) && g.length !== pt || T === Br && g.length > 206) {
        k(w, "invalid action control");
        return;
      }
      let p = L.getUint32(2);
      if (T === Cr) {
        let E = m.get(w);
        if (E?.get(p)?.accept()) for (let R of E.values()) R.touch();
        return;
      }
      if (T === Br) {
        m.get(w)?.get(p)?.fail(Ut("rejected", Et(g.subarray(pt))), true);
        return;
      }
      T === On ? h.cancel(w, p) : h.receiveChunk(w, p, g.length >= cn ? L.getFloat64(pt) : NaN, g.subarray(cn));
      return;
    }
    let C = T === Cn ? Or : Hi;
    if (g.length < C) {
      k(w, "invalid action header");
      return;
    }
    let G = Et(g.subarray(2, 34)).replaceAll("\0", ""), te = s.get(G);
    if (!n(w, !!te?.options.receiveWhilePending)) return;
    let ae = L.getUint16(34), Y = C + ae, ie = T === Cn ? g.length - Y : L.getFloat64(40), fe = T === Bn ? L.getUint32(36) : 0;
    if (!G || Y > g.length || !Number.isSafeInteger(ie) || ie < 0 || T === Bn && (ie === 0 || Y !== g.length)) {
      k(w, "invalid action proposal");
      return;
    }
    let se;
    try {
      ae && (se = sn(Et(g.subarray(C, Y))));
    } catch {
      k(w, "invalid action metadata");
      return;
    }
    let z = { peerId: w, type: G, format: S, size: ie, ...se === void 0 ? {} : { metadata: se } };
    T === Cn ? h.receiveInline(z, g.subarray(Y)) : h.receiveOffer(z, fe);
  }, clearPeer: y };
}, Ni = (e) => e && typeof e == "object" && !Array.isArray(e) && typeof e.r == "string" ? e : null, jn = (e) => {
  let t = Ni(e);
  return t ? { r: t.r, ...Object.hasOwn(t, "m") ? { m: t.m } : {} } : null;
}, Ur = (e) => {
  let t = Ni(e);
  return t ? { r: t.r, ...typeof t.e == "string" ? { e: t.e } : {} } : null;
}, dn = (e, t) => t === void 0 ? e : { ...e, metadata: t }, Ac = ({ getPeer: e, getPeerIds: t, canReceiveFromPeer: n, onPeerError: r, maxReceiveBytes: a }) => {
  let i = /* @__PURE__ */ Object.create(null), s = {}, m = /* @__PURE__ */ new Map(), u = Mc({ getPeer: e, getPeerIds: t, canReceiveFromPeer: n, onPeerError: r, ...a === void 0 ? {} : { maxReceiveBytes: a } }), f = u.makeInternalAction, h = u.handleData, y = (x) => {
    let g = s[x];
    g && (re(g.timer), g.signal && g.abortHandler && g.signal.removeEventListener("abort", g.abortHandler), delete s[x], g.controller.abort());
  }, k = (x, g) => {
    Bt(s).forEach(([T, S]) => {
      S.peerId === x && (y(T), S.reject(g));
    });
  }, D = (x, g) => {
    u.clearPeer(x);
    let T = m.get(x);
    T && (m.delete(x), T.forEach((S) => S.abort())), k(x, ft("disconnected", Ot(g, "peer disconnected")));
  }, w = f("@_response", { receiveScope: (x, g) => {
    let T = Ur(g), S = T && s[T.r];
    if (!T || !S || S.peerId !== x) return null;
    let L = T.e === void 0 ? S.getReceive() : null;
    return { key: T.r, signal: S.controller.signal, receive: L ? (C) => L({ byteLength: C.byteLength, peerId: C.peerId, kind: "response", signal: C.signal }) : null, reject: (C) => {
      s[T.r] === S && (y(T.r), S.reject(ft("rejected", C)));
    } };
  } });
  return w.onProgress((x, g, T) => {
    let S = Ur(T), L = S && s[S.r];
    L && L.peerId === g && S?.e === void 0 && L.getReceiveProgress()?.(x, { peerId: g });
  }), w.onMessage((x, g, T) => {
    let S = Ur(T);
    if (!S) return;
    let L = s[S.r];
    if (!(!L || L.peerId !== g)) {
      if (y(S.r), S.e !== void 0) {
        L.reject(ft("rejected", S.e));
        return;
      }
      L.resolve(x);
    }
  }), { makeAction: (x, g) => {
    if (g && "onRequest" in g && g.kind !== "request") throw Z('request actions must use kind: "request"');
    let T = g?.kind ?? "message", S = f(x), L = i[x];
    if (L) {
      if (L.kind !== T) throw Z(`action type "${x}" cannot be redefined`);
      return L.action;
    }
    let C = { kind: T, action: null, onReceive: g?.onReceive ?? null, onReceiveProgress: g?.onReceiveProgress ?? null }, G = (z, p) => z ? (E, R) => z(E, dn({ peerId: R }, p)) : void 0, te = (z, p, E) => {
      let R = C.kind === "request" ? jn(E) : null;
      C.onReceiveProgress?.(z, dn({ peerId: p }, R ? R.m : E));
    }, ae = (z) => {
      C.onReceive = z, S.onReceive(z ? (p) => {
        let E = T === "request" ? jn(p.metadata) : null;
        return z(dn({ byteLength: p.byteLength, peerId: p.peerId, signal: p.signal, kind: T }, E ? E.m : p.metadata));
      } : null);
    };
    if (ae(C.onReceive), S.onProgress(te), T === "message") {
      let z = g?.onMessage ?? null, p = (R, j, _) => {
        let O = z;
        Promise.resolve().then(() => O(R, dn({ peerId: j }, _))).catch((P) => console.error(`${Ie} action handler error:`, P));
      }, E = { send: async (R, j = {}) => {
        await S.send(R, j.target, j.metadata, G(j.onProgress, j.metadata), j.signal);
      }, get onMessage() {
        return z;
      }, set onMessage(R) {
        z = R, S.onMessage(R ? p : null);
      }, get onReceive() {
        return C.onReceive;
      }, set onReceive(R) {
        ae(R);
      }, get onReceiveProgress() {
        return C.onReceiveProgress;
      }, set onReceiveProgress(R) {
        C.onReceiveProgress = R;
      } };
      return C.action = E, i[x] = C, S.onMessage(z ? p : null), E;
    }
    S.onReject((z, p, E) => {
      let R = jn(p);
      R && w.send(null, z, { r: R.r, e: E }).catch(Se);
    });
    let Y = g?.onRequest ?? null, ie = (z, p, E) => {
      let R = jn(E);
      if (!R) return;
      let j = Y, _ = new AbortController(), O = m.get(p);
      O || (O = /* @__PURE__ */ new Set(), m.set(p, O)), O.add(_), Promise.resolve().then(async () => {
        let P = await j(z, { ...dn({ peerId: p }, R.m), signal: _.signal });
        if (P === void 0) throw Z("request handler returned undefined");
        return P;
      }).then((P) => w.send(P, p, { r: R.r }), (P) => w.send(null, p, { r: R.r, e: Ot(P, "request failed").slice(0, 512) })).catch(Se).finally(() => {
        let P = m.get(p);
        P?.delete(_), P && !P.size && m.delete(p), _.abort();
      });
    }, fe = async (z, p) => {
      let { target: E, metadata: R, onProgress: j, signal: _, timeoutMs: O } = p;
      if (Hr(_), !e(E, false)) throw ft("disconnected", `no active peer with id ${E}`);
      let P = It(20), M = new AbortController(), q = new Promise((J, ue) => {
        let Q = { controller: M, getReceive: () => C.onReceive, getReceiveProgress: () => C.onReceiveProgress, peerId: E, resolve: J, reject: ue, timer: null, ..._ === void 0 ? {} : { signal: _ } }, be = () => {
          y(P), ue(ft("aborted", "operation aborted"));
        };
        _ && (Q.abortHandler = be, _.addEventListener("abort", be, { once: true })), s[P] = Q, O !== void 0 && (Q.timer = setTimeout(() => {
          y(P), Q.reject(ft("timeout", "request timed out"));
        }, O));
      });
      try {
        let J = S.send(z, E, R === void 0 ? { r: P } : { r: P, m: R }, G(j, R), M.signal);
        return await Promise.race([q, J.then(() => q)]);
      } finally {
        y(P);
      }
    }, se = { request: fe, requestMany: async (z, p) => {
      let { targets: E, onResult: R, ...j } = p;
      return Hr(j.signal), await Lt(E.map(async (_) => {
        try {
          let O = { peerId: _, status: "fulfilled", value: await fe(z, { ...j, target: _ }) };
          return R?.(O), O;
        } catch (O) {
          let P = mt(O, "request failed");
          if (P.kind === "aborted" || !P.kind) throw P;
          let M = P.kind === "timeout" ? { peerId: _, status: "timeout" } : P.kind === "disconnected" ? { peerId: _, status: "disconnected" } : { peerId: _, status: "rejected", error: P };
          return R?.(M), M;
        }
      }));
    }, get onRequest() {
      return Y;
    }, set onRequest(z) {
      Y = z, S.onMessage(z ? ie : null);
    }, get onReceive() {
      return C.onReceive;
    }, set onReceive(z) {
      ae(z);
    }, get onReceiveProgress() {
      return C.onReceiveProgress;
    }, set onReceiveProgress(z) {
      C.onReceiveProgress = z;
    } };
    return C.action = se, i[x] = C, S.onMessage(Y ? ie : null), se;
  }, makeInternalAction: f, handleData: h, clearPeer: D };
}, Vi = (e) => e && typeof e == "object" && !Array.isArray(e) && typeof e.k == "string" ? { key: e.k, ...typeof e.s == "string" ? { streamId: e.s } : {}, ...typeof e.t == "string" ? { trackId: e.t } : {}, ...Object.hasOwn(e, "m") ? { metadata: e.m } : {} } : null, Ki = (e) => (t) => {
  let n = e.get(t);
  return n || (n = It(20), e.set(t, n)), n;
}, qr = () => {
  let e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new WeakMap(), m = /* @__PURE__ */ new WeakMap();
  return { getStreamKey: Ki(e), getTrackKey: Ki(t), rememberRemoteStream: (u, f, h) => {
    let y = s.get(f);
    y !== void 0 && n.get(y) === f && n.delete(y), s.set(f, u), n.set(u, f), h && r.set(h, f), f.getTracks?.().forEach((k) => {
      typeof k.id == "string" && i.set(k.id, { track: k, stream: f });
    });
  }, getRemoteStream: (u, f) => n.get(u) ?? (f ? r.get(f) : void 0), rememberRemoteTrack: (u, f, h, y, k) => {
    let D = { track: f, stream: h }, w = m.get(f);
    w !== void 0 && a.get(w)?.track === f && a.delete(w), m.set(f, u), a.set(u, D), y && i.set(y, D), k && r.set(k, h);
  }, getRemoteTrack: (u, f) => a.get(u) ?? (f ? i.get(f) : void 0), hasRemoteMedia: () => n.size > 0 || a.size > 0, clearRemote: () => {
    n.clear(), r.clear(), a.clear(), i.clear();
  } };
}, Rc = ({ iterate: e, isActive: t, getSharedMediaPeer: n, onPeerError: r }) => {
  let a = {}, i = {}, s = {}, m = qr(), u = (x) => n(x)?.__trysteroMedia ?? (s[x] ??= qr()), f = (x, g, T, S) => {
    let L = x[g] ??= [];
    if (L.length >= 64) {
      console.warn(`${Ie}: too many pending ${S} metadata messages`), r(g, Z("too many pending media metadata messages"));
      return;
    }
    L.push(T);
  }, h = (x, g, T) => {
    if (!x?.length) return;
    let S = g ? x.findIndex((L) => {
      let C = T(L);
      return !C || C === g;
    }) : 0;
    return S >= 0 ? x.splice(S, 1)[0] : void 0;
  }, y = (x, g, T, S) => {
    t(x) && (u(x).rememberRemoteStream(g, T, typeof T.id == "string" ? T.id : void 0), w.onPeerStream?.(T, x, S));
  }, k = (x, g, T, S, L) => {
    t(x) && (u(x).rememberRemoteTrack(g, T, S, typeof T.id == "string" ? T.id : void 0, typeof S.id == "string" ? S.id : void 0), w.onPeerTrack?.(T, S, x, L));
  }, D = (x, g, T, S, L, C = {}) => {
    let G = { k: g, ...C, ...T === void 0 ? {} : { m: T } };
    return e(x, async (te, ae) => {
      await S(G, te), await L(ae);
    });
  }, w = { addStream: (x, g, T) => D(g.target, m.getStreamKey(x), g.metadata, T, (S) => S.addStream(x), { s: x.id }), removeStream: (x, g) => {
    e(g, (T, S) => S.removeStream(x));
  }, addTrack: (x, g, T, S) => D(T.target, m.getTrackKey(x), T.metadata, S, (L) => L.addTrack(x, g), { s: g.id, t: x.id }), removeTrack: (x, g) => {
    e(g, (T, S) => S.removeTrack(x));
  }, replaceTrack: (x, g, T, S) => D(T.target, m.getTrackKey(g), T.metadata, S, (L) => L.replaceTrack(x, g), { t: x.id }), receiveStreamMeta: (x, g) => {
    if (!t(g)) return;
    let T = Vi(x);
    if (!T) return;
    let S = u(g).getRemoteStream(T.key, T.streamId);
    if (S?.getTracks().length) {
      y(g, T.key, S, T.metadata);
      return;
    }
    f(a, g, T, "stream");
  }, receiveTrackMeta: (x, g) => {
    if (!t(g)) return;
    let T = Vi(x);
    if (!T) return;
    let S = u(g).getRemoteTrack(T.key, T.trackId);
    if (S && S.track.readyState !== "ended" && (!S.stream.getTracks || S.stream.getTracks().includes(S.track))) {
      k(g, T.key, S.track, S.stream, T.metadata);
      return;
    }
    f(i, g, T, "track");
  }, receiveRemoteStream: (x, g) => {
    if (!t(x)) return;
    let T = h(a[x], typeof g.id == "string" ? g.id : void 0, (S) => S.streamId);
    T && y(x, T.key, g, T.metadata);
  }, receiveRemoteTrack: (x, g, T) => {
    if (!t(x)) return;
    let S = i[x], L = typeof g.id == "string" ? g.id : void 0, C = typeof T.id == "string" ? T.id : void 0, G = S && L ? S.findIndex((ae) => ae.trackId === L) : -1, te = G >= 0 ? S?.splice(G, 1)[0] : h(S, C, (ae) => ae.streamId);
    te && k(x, te.key, g, T, te.metadata);
  }, clearPeer: (x) => {
    delete a[x], delete i[x], delete s[x];
  }, onPeerStream: null, onPeerTrack: null };
  return w;
}, Wi = "beforeunload", $c = 1e4, gt = (e) => "@_" + e, un = /* @__PURE__ */ new Set(), Gi = () => un.forEach((e) => e()), Cc = (e) => (un.add(e), un.size === 1 && addEventListener(Wi, Gi), () => {
  un.delete(e), un.size || removeEventListener(Wi, Gi);
}), Bc = (e, t, n, { onPeerHandshake: r, onHandshakeError: a, handshakeTimeoutMs: i = $c, maxReceiveBytes: s, isPassive: m = false, onBeforeLeave: u } = {}) => {
  let f = {}, h = {}, y = {}, k = { onPeerJoin: null, onPeerLeave: null }, D = Se, w = null, x = (P, M) => (P ? Array.isArray(P) ? P : [P] : Ve(h)).flatMap((q) => {
    let J = h[q];
    return J ? [Promise.resolve(M(q, J))] : (console.warn(`${Ie}: no peer with id ${q} found`), []);
  }), g = (P, M, q) => {
    let J = f[P];
    !J || M && J !== M || (R.send("", P).catch(Se), Y(P, J, q));
  }, T = (P, M) => g(P, void 0, M), S = Rc({ onPeerError: T, iterate: (P, M) => x(P, (q, J) => M(q, J)), isActive: (P) => !!h[P], getSharedMediaPeer: (P) => f[P] ?? null }), L = Ac({ onPeerError: T, ...s === void 0 ? {} : { maxReceiveBytes: s }, getPeer: (P, M) => (M ? f : h)[P], getPeerIds: (P) => Ve(P ? f : h), canReceiveFromPeer: (P, M) => O.canReceiveFromPeer(P, M) }), C = L.makeInternalAction, G = L.handleData, te = L.makeAction, ae = (P, M = Z("peer disconnected")) => {
    let q = mt(M, "peer disconnected");
    O.clearPeer(P, q), delete f[P], delete h[P], L.clearPeer(P, q), y[P]?.splice(0).forEach((J) => J.reject(q)), delete y[P], S.clearPeer(P);
  }, Y = (P, M, q) => {
    let J = f[P];
    if (!J || M && J !== M) return;
    let ue = !!h[P];
    ae(P, q), J.destroy(), ue && k.onPeerLeave?.(P), t(P);
  }, ie = () => w ??= (async () => {
    u?.();
    let P = new AbortController();
    R.send("", void 0, void 0, void 0, P.signal).catch(Se), await new Promise((M) => setTimeout(M, 99)), P.abort();
    try {
      Bt(f).forEach(([M, q]) => {
        q.destroy(), ae(M, Z("room left"));
      });
    } finally {
      try {
        D();
      } finally {
        n();
      }
    }
  })(), fe = C(gt("ping")), se = C(gt("pong")), z = C(gt("signal")), p = C(gt("stream"), { maxPayloadBytes: 65536 }), E = C(gt("track"), { maxPayloadBytes: 65536 }), R = C(gt("leave"), { sendToPending: true, receiveWhilePending: true }), j = C(gt("hsdata"), { sendToPending: true, receiveWhilePending: true, maxPayloadBytes: 65536 }), _ = C(gt("hsready"), { sendToPending: true, receiveWhilePending: true }), O = uc({ ...r === void 0 ? {} : { onPeerHandshake: r }, ...a === void 0 ? {} : { onHandshakeError: a }, handshakeTimeoutMs: i, sendHandshakeData: j.send, sendHandshakeReady: _.send, onActivate: (P, M) => {
    h[P] = M, M.setHandlers({ signal: (q) => {
      h[P] === M && z.send(q, P).catch(Se);
    } }), k.onPeerJoin?.(P);
  }, onFailure: (P, M, q) => g(P, M, q) });
  return fe.onMessage((P, M) => {
    se.send("", M).catch(Se);
  }), se.onMessage((P, M) => {
    let q = y[M];
    q?.shift()?.resolve(), q && !q.length && delete y[M];
  }), z.onMessage((P, M) => {
    h[M]?.signal(P);
  }), p.onMessage((P, M) => S.receiveStreamMeta(P, M)), E.onMessage((P, M) => S.receiveTrackMeta(P, M)), R.onMessage((P, M) => Y(M, void 0, Z("peer left room"))), j.onMessage((P, M, q) => O.receiveHandshakeData(P, M, q)), _.onMessage((P, M) => O.receiveHandshakeReady(M)), e((P, M) => {
    let q = f[M];
    if (q) {
      if (q === P) return;
      q.destroy(), ae(M, Z("peer replaced"));
    }
    f[M] = P, O.addPeer(M, P), P.setHandlers({ data: (J) => {
      f[M] === P && G(M, J);
    }, stream: (J) => S.receiveRemoteStream(M, J), track: (J, ue) => S.receiveRemoteTrack(M, J, ue), close: () => Y(M, P, Z("peer disconnected")), error: (J) => {
      console.error(`${Ie} peer error:`, J), Y(M, P, J);
    } }), O.start(M, P);
  }), xi && (D = Cc(() => ie().catch(Se))), { makeAction: te, leave: ie, ping: async (P) => {
    if (!h[P]) throw Z(`no active peer with id ${P}`);
    let M = Date.now();
    return await new Promise((q, J) => {
      let ue = y[P] ??= [], Q = () => {
        let we = y[P];
        if (!we) return;
        let Pe = we.indexOf(be);
        Pe > -1 && we.splice(Pe, 1), we.length || delete y[P];
      }, be = { resolve: () => {
        Q(), q();
      }, reject: (we) => {
        Q(), J(we);
      } };
      ue.push(be), fe.send("", P).catch((we) => be.reject(mt(we, "peer disconnected")));
    }), Date.now() - M;
  }, isPassive: () => m, getPeers: () => Si(Bt(h).map(([P, M]) => [P, M.connection])), addStream: (P, M = {}) => S.addStream(P, M, p.send), removeStream: (P, M = {}) => {
    S.removeStream(P, M.target);
  }, addTrack: (P, M, q = {}) => S.addTrack(P, M, q, E.send), removeTrack: (P, M = {}) => {
    S.removeTrack(P, M.target);
  }, replaceTrack: (P, M, q = {}) => S.replaceTrack(P, M, q, E.send), get onPeerJoin() {
    return k.onPeerJoin;
  }, set onPeerJoin(P) {
    k.onPeerJoin = P, P && Ve(h).forEach((M) => P(M));
  }, get onPeerLeave() {
    return k.onPeerLeave;
  }, set onPeerLeave(P) {
    k.onPeerLeave = P;
  }, get onPeerStream() {
    return S.onPeerStream;
  }, set onPeerStream(P) {
    S.onPeerStream = P;
  }, get onPeerTrack() {
    return S.onPeerTrack;
  }, set onPeerTrack(P) {
    S.onPeerTrack = P;
  } };
}, Ji = 1, Yi = 2, Xi = (e, t) => {
  let n = et(e), r = new Uint8Array(3 + n.byteLength + t.byteLength);
  return r[0] = Ji, r[1] = n.byteLength >>> 8 & 255, r[2] = n.byteLength & 255, r.set(n, 3), r.set(t, 3 + n.byteLength), r;
}, Oc = (e, t) => {
  let n = et(e), r = new Uint8Array(4 + n.byteLength);
  return r[0] = Yi, r[1] = Number(t), r[2] = n.byteLength >>> 8 & 255, r[3] = n.byteLength & 255, r.set(n, 4), r;
}, Zi = (e, t) => {
  if (e.byteLength < t + 2) return null;
  let n = (e[t] ?? 0) << 8 | (e[t + 1] ?? 0), r = t + 2 + n;
  return n <= 0 || n > 128 || e.byteLength < r ? null : { roomToken: Et(e.subarray(t + 2, r)), headerSize: r };
}, jc = (e) => {
  let t = new Uint8Array(e);
  if (t.byteLength < 3 || t.byteLength > 16515) return null;
  if (t[0] === Ji) {
    let n = Zi(t, 1);
    return n ? { type: "room", roomToken: n.roomToken, payload: t.subarray(n.headerSize).slice().buffer } : null;
  }
  if (t[0] === Yi) {
    let n = Zi(t, 2);
    return n ? { type: "presence", roomToken: n.roomToken, isPresent: t[1] === 1 } : null;
  }
  return null;
}, Hn = (e) => {
  let { connection: t, channel: n } = e;
  return e.isDead || t.connectionState === "closed" || t.connectionState === "failed" || t.iceConnectionState === "closed" || t.iceConnectionState === "failed" || n?.readyState === "closing" || n?.readyState === "closed";
}, Hc = (e) => {
  if (Hn(e)) return "stale";
  let { channel: t } = e;
  return !t || t.readyState !== "open" ? "transient" : "live";
}, Uc = class {
  rooms = /* @__PURE__ */ new Map();
  unclaimedDataTimers = /* @__PURE__ */ new WeakMap();
  pendingDataTimers = /* @__PURE__ */ new WeakMap();
  byApp = {};
  registerRoom(e, t, n, r) {
    let a = this.rooms.get(e) ?? /* @__PURE__ */ new Map();
    if (a.has(t)) throw Z("room membership already registered");
    let i = { token: null, tokenPromise: n, ...r };
    a.set(t, i), this.rooms.set(e, a);
    let s = () => this.rooms.get(e)?.get(t) === i, m = (u) => {
      if (i.token) for (let f of Qe(this.byApp[e] ?? {})) try {
        this.sendRoomPresence(f, i.token, u);
      } catch {
      }
    };
    return n.then((u) => {
      if (s()) {
        i.token = u;
        for (let f of Qe(this.byApp[e] ?? {})) f.remoteRoomTokens.has(u) && this.attachRoom(e, t, i, f), this.discardUnboundData(f);
        s() && i.active && m(true);
      }
    }), { connect: (u, f, h) => {
      if (!s()) {
        f.destroy();
        return;
      }
      let y = this.reusable(e, u);
      y && y.peer !== f && f.destroy();
      let k = y ?? this.register(e, u, f, h);
      if (this.attachRoom(e, t, i, k), !y) for (let D of a.values()) D.active && D.token && this.sendRoomPresence(k, D.token, true);
    }, reuse: (u) => {
      if (!s()) return false;
      let f = this.reusable(e, u);
      return f ? (this.attachRoom(e, t, i, f), true) : false;
    }, setActive: (u) => {
      !s() || i.active === u || (i.active = u, m(u));
    }, leave: () => {
      if (s()) {
        a.delete(t), a.size || this.rooms.delete(e), m(false);
        for (let u of Qe(this.byApp[e] ?? {})) {
          let f = u.bindings[t];
          f?.handlers.close?.(), f?.detach(), this.discardUnboundData(u);
        }
      }
    } };
  }
  owns(e, t, n) {
    return this.byApp[e]?.[t]?.peer === n;
  }
  reusable(e, t) {
    let n = this.byApp[e]?.[t];
    if (n && Hn(n.peer)) {
      this.clear(e, t, { destroyPeer: true });
      return;
    }
    return n;
  }
  attachRoom(e, t, n, r) {
    if (this.rooms.get(e)?.get(t) !== n || r.isClosing || this.get(e, r.peerId) !== r) return;
    let { proxy: a, isNew: i } = this.bind(t, n.tokenPromise, r, { onDetach: () => n.onDetach(r.peerId, r.peer) });
    i && n.onPeer(a, r.peerId, r.peer);
  }
  get(e, t) {
    return this.byApp[e]?.[t];
  }
  sendRoomPresence(e, t, n) {
    e.isClosing || Hn(e.peer) || e.peer.sendData(Oc(t, n));
  }
  clear(e, t, { destroyPeer: n }) {
    let r = this.byApp[e], a = r?.[t];
    if (!a || a.isClosing) return;
    a.idleTimer = re(a.idleTimer), this.clearDataTimers(a), a.isClosing = true, n && !a.peer.isDead && a.peer.destroy();
    let i = Qe(a.bindings);
    a.bindings = {}, a.bindingsByToken = {}, a.controlRoomId = null, delete r[t], i.forEach((s) => {
      s.handlers.close?.(), s.pendingData.length = 0, s.pendingSendData.length = 0, s.pendingTracks.length = 0;
    }), a.media.clearRemote(), a.pendingDataByToken.clear(), a.remoteRoomTokens.clear(), Ve(r).length === 0 && delete this.byApp[e];
  }
  register(e, t, n, r) {
    let a = this.byApp[e]?.[t];
    if (a) {
      if (a.idleTimer = re(a.idleTimer), a.peer === n) return a;
      this.clear(e, t, { destroyPeer: true });
    }
    let i = { appId: e, peerId: t, peer: n, bindings: {}, bindingsByToken: {}, pendingDataByToken: /* @__PURE__ */ new Map(), remoteRoomTokens: /* @__PURE__ */ new Set(), idleTimer: null, controlRoomId: null, streamOwners: /* @__PURE__ */ new Map(), trackOwners: /* @__PURE__ */ new Map(), media: qr(), idleMs: r, isClosing: false };
    (this.byApp[e] ??= {})[t] = i;
    let s = () => {
      this.owns(e, t, n) && this.clear(e, t, { destroyPeer: true });
    };
    return n.setHandlers({ data: (m) => this.dispatchData(i, m), signal: (m) => this.dispatchSignal(i, m), close: s, error: (m) => {
      console.error(`${Ie} peer error:`, m), s();
    }, track: (m, u) => this.dispatchTrack(i, m, u) }), i;
  }
  bind(e, t, n, { onDetach: r }) {
    let a = n.bindings[e];
    if (a) return n.idleTimer = re(n.idleTimer), { proxy: a.proxy, isNew: false };
    let i = { roomId: e, roomToken: null, roomTokenPromise: t, handlers: {}, pendingData: [], pendingSendData: [], pendingTracks: [], detach: Se, proxy: {} }, s = () => {
      if (n.bindings[e] !== i) return;
      let u = Ve(n.bindings).length === 1 && (n.streamOwners.size > 0 || n.trackOwners.size > 0 || n.media.hasRemoteMedia());
      u || this.pruneRoomOwnership(n, e), delete n.bindings[e], i.roomToken && n.bindingsByToken[i.roomToken] === i && delete n.bindingsByToken[i.roomToken], n.controlRoomId === e && (n.controlRoomId = Ve(n.bindings)[0] ?? null), this.discardUnboundData(n), r(), u ? this.clear(n.appId, n.peerId, { destroyPeer: true }) : this.scheduleIdleTimer(n);
    }, m = { get connection() {
      return n.peer.connection;
    }, get channel() {
      return n.peer.channel;
    }, get isDead() {
      return n.peer.isDead;
    }, getOffer: (u) => n.peer.getOffer(u), signal: (u) => n.peer.signal(u), sendData: (u) => {
      if (!i.roomToken) {
        i.pendingSendData.push(u);
        return;
      }
      n.peer.sendData(Xi(i.roomToken, u));
    }, destroy: () => s(), setHandlers: (u) => {
      Object.assign(i.handlers, u), this.flushBindingQueues(n, i);
    }, addStream: (u) => {
      let f = n.streamOwners.get(u) ?? /* @__PURE__ */ new Set(), h = f.size === 0;
      f.add(e), n.streamOwners.set(u, f), h && n.peer.addStream(u);
    }, removeStream: (u) => this.releaseStreamOwner(n, u, e), addTrack: (u, f) => {
      let h = n.trackOwners.get(u) ?? { stream: f, rooms: /* @__PURE__ */ new Set() }, y = h.rooms.size === 0;
      return h.stream = f, h.rooms.add(e), n.trackOwners.set(u, h), y ? n.peer.addTrack(u, f) : n.peer.connection.getSenders().find((k) => k.track === u) ?? n.peer.addTrack(u, f);
    }, removeTrack: (u) => this.releaseTrackOwner(n, u, e), replaceTrack: async (u, f) => {
      let h = n.trackOwners.get(u);
      if (await n.peer.replaceTrack(u, f), h && n.trackOwners.get(u) === h) {
        n.trackOwners.delete(u);
        let y = n.trackOwners.get(f) ?? { stream: h.stream, rooms: /* @__PURE__ */ new Set() };
        h.rooms.forEach((k) => y.rooms.add(k)), n.trackOwners.set(f, y);
      }
    }, __trysteroMedia: n.media };
    return i.proxy = m, i.detach = s, n.bindings[e] = i, n.controlRoomId ??= e, n.idleTimer = re(n.idleTimer), t.then((u) => {
      if (n.isClosing || n.bindings[e] !== i) return;
      i.roomToken = u, n.bindingsByToken[u] = i;
      let f = n.pendingDataByToken.get(u);
      f?.length && (i.pendingData.push(...f), n.pendingDataByToken.delete(u));
      let h = i.pendingSendData.splice(0);
      Hn(n.peer) || h.forEach((y) => {
        try {
          n.peer.sendData(Xi(u, y));
        } catch {
        }
      }), this.flushBindingQueues(n, i), this.discardUnboundData(n);
    }), { proxy: m, isNew: true };
  }
  releaseStreamOwner(e, t, n) {
    let r = e.streamOwners.get(t);
    r && (r.delete(n), r.size === 0 && (e.streamOwners.delete(t), e.peer.removeStream(t)));
  }
  releaseTrackOwner(e, t, n) {
    let r = e.trackOwners.get(t);
    r && (r.rooms.delete(n), r.rooms.size === 0 && (e.trackOwners.delete(t), e.peer.removeTrack(t)));
  }
  pruneRoomOwnership(e, t) {
    e.streamOwners.forEach((n, r) => this.releaseStreamOwner(e, r, t)), e.trackOwners.forEach((n, r) => this.releaseTrackOwner(e, r, t));
  }
  scheduleIdleTimer(e) {
    e.isClosing || Ve(e.bindings).length > 0 || (e.idleTimer = re(e.idleTimer), e.idleTimer = setTimeout(() => {
      let t = this.byApp[e.appId]?.[e.peerId];
      !t || Ve(t.bindings).length > 0 || this.clear(e.appId, e.peerId, { destroyPeer: true });
    }, e.idleMs));
  }
  getSignalBinding(e) {
    if (e.controlRoomId) {
      let n = e.bindings[e.controlRoomId];
      if (n?.handlers.signal) return n;
    }
    let t = Qe(e.bindings).find((n) => !!n.handlers.signal);
    return t ? (e.controlRoomId = t.roomId, t) : null;
  }
  flushBindingQueues(e, t) {
    let { handlers: n } = t;
    if (n.data && t.pendingData.length > 0) {
      let r = t.pendingData.splice(0);
      this.syncDataTimers(e), r.forEach((a) => n.data?.(a));
    } else this.syncDataTimers(e);
    (n.track || n.stream) && t.pendingTracks.length && t.pendingTracks.splice(0).forEach(({ track: r, stream: a }) => {
      n.track?.(r, a), n.stream?.(a);
    });
  }
  unclaimedBufferedFrameCount(e) {
    let t = 0;
    for (let n of e.pendingDataByToken.values()) t += n.length;
    return t;
  }
  boundBufferedFrameCount(e) {
    let t = 0;
    for (let n of Qe(e.bindings)) t += n.pendingData.length;
    return t;
  }
  bufferedFrameCount(e) {
    return this.unclaimedBufferedFrameCount(e) + this.boundBufferedFrameCount(e);
  }
  clearDataTimers(e) {
    re(this.unclaimedDataTimers.get(e)), this.unclaimedDataTimers.delete(e), re(this.pendingDataTimers.get(e)), this.pendingDataTimers.delete(e);
  }
  syncDataTimers(e) {
    if (e.isClosing) {
      this.clearDataTimers(e);
      return;
    }
    this.unclaimedBufferedFrameCount(e) === 0 ? (re(this.unclaimedDataTimers.get(e)), this.unclaimedDataTimers.delete(e)) : this.unclaimedDataTimers.has(e) || this.unclaimedDataTimers.set(e, setTimeout(() => {
      this.unclaimedDataTimers.delete(e), e.pendingDataByToken.clear();
    }, 1e4)), this.boundBufferedFrameCount(e) === 0 ? (re(this.pendingDataTimers.get(e)), this.pendingDataTimers.delete(e)) : this.pendingDataTimers.has(e) || this.pendingDataTimers.set(e, setTimeout(() => {
      this.pendingDataTimers.delete(e), this.boundBufferedFrameCount(e) > 0 && this.failData(e, "room data handler timed out");
    }, 1e4));
  }
  canBindRoomToken(e, t) {
    return Qe(e.bindings).some((n) => !n.roomToken) || [...this.rooms.get(e.appId)?.values() ?? []].some((n) => !n.token || n.token === t);
  }
  discardUnboundData(e) {
    for (let t of e.pendingDataByToken.keys()) this.canBindRoomToken(e, t) || e.pendingDataByToken.delete(t);
    this.syncDataTimers(e);
  }
  failData(e, t) {
    console.warn(`${Ie}: ${t}; disconnecting peer ${e.peerId}`), this.clear(e.appId, e.peerId, { destroyPeer: true });
  }
  dispatchData(e, t) {
    if (e.isClosing) return;
    let n = jc(t);
    if (!n) {
      this.failData(e, "invalid or incompatible room frame");
      return;
    }
    if (n.type === "presence") {
      if (n.isPresent) {
        if (!e.remoteRoomTokens.has(n.roomToken) && e.remoteRoomTokens.size >= 64) {
          this.failData(e, "too many advertised rooms");
          return;
        }
        e.remoteRoomTokens.add(n.roomToken);
        for (let [a, i] of this.rooms.get(e.appId) ?? []) i.token === n.roomToken && this.attachRoom(e.appId, a, i, e);
      } else {
        e.remoteRoomTokens.delete(n.roomToken), e.pendingDataByToken.delete(n.roomToken);
        let a = e.bindingsByToken[n.roomToken];
        a?.handlers.close?.(), a?.detach(), this.syncDataTimers(e);
      }
      return;
    }
    let r = e.bindingsByToken[n.roomToken];
    if (!r) {
      if (!this.canBindRoomToken(e, n.roomToken) || this.bufferedFrameCount(e) >= 64) return;
      let a = e.pendingDataByToken.get(n.roomToken) ?? [];
      a.push(n.payload), e.pendingDataByToken.set(n.roomToken, a), this.syncDataTimers(e);
      return;
    }
    if (r.handlers.data) r.handlers.data(n.payload);
    else {
      if (this.bufferedFrameCount(e) >= 64) {
        this.failData(e, "too much data waiting for a room handler");
        return;
      }
      r.pendingData.push(n.payload), this.syncDataTimers(e);
    }
  }
  dispatchSignal(e, t) {
    let n = this.getSignalBinding(e);
    n ? n.handlers.signal?.(t) : t.type === "offer" && this.clear(e.appId, e.peerId, { destroyPeer: true });
  }
  dispatchTrack(e, t, n) {
    Qe(e.bindings).forEach((r) => {
      if (r.handlers.track || r.handlers.stream) {
        r.handlers.track?.(t, n), r.handlers.stream?.(n);
        return;
      }
      r.pendingTracks.push({ track: t, stream: n });
    });
  }
}, Qi = 23333, qc = 57333, Fc = 12, zc = 7533, _c = 23333, mn = "offer-placeholder", Nc = ["offer", "answer", "candidate"], es = (e) => {
  if (typeof e == "string") try {
    let t = sn(e);
    return t && typeof t == "object" && !Array.isArray(t) ? t : null;
  } catch {
    return null;
  }
  return e && typeof e == "object" && !Array.isArray(e) ? e : null;
}, ht = (e, t) => typeof e[t] == "string" && e[t] ? e[t] : void 0, ts = (e) => !!(e && typeof e == "object" && typeof e.signal == "function" && typeof e.destroy == "function" && typeof e.setHandlers == "function"), ns = (e, t = false) => Nc.some((n) => n in e && (typeof e[n] != "string" || e[n] === "")) || "peer" in e && (t || e.peer !== void 0 && !ts(e.peer)), Vc = (e) => {
  let t = es(e);
  if (!t || ns(t, typeof e == "string")) return false;
  let n = ht(t, "peerId");
  return !!(n && n !== Oe && t.passive !== true && !ht(t, "answer") && !ht(t, "candidate"));
}, Kc = (e, t, n, r, a, i) => {
  e.toCipher(t).then((s) => {
    e.isLeaving() || !i() || r(n, De(a(s.sdp)));
  });
}, Wc = () => ({ offerPeer: null, offerId: null, offerSdp: null, offerInitPromise: null, offerAnswered: false, offerRelays: [], offerSignalRelays: [], offerSignalBacklog: [], offerRelayTimers: [], offerExpiryTimer: null, connectedPeer: null, connectedPeerUnhealthySinceMs: null, answeringExpiryTimer: null, answeringPeer: null, answerSent: false, answerReplay: null, connectionErrorReported: false }), Gc = (e) => [...e.turnConfig ?? [], ...e.rtcConfig?.iceServers ?? []].some(({ urls: t }) => (Array.isArray(t) ? t : [t]).some((n) => /^turns?:/i.test(n))), Jc = (e, t) => `could not connect to peer ${e} after exchanging SDP; ${Gc(t) ? "check that your TURN server URLs and credentials are reachable by both peers" : "configure TURN servers with turnConfig or rtcConfig.iceServers"}`, Un = (e, t, n) => {
  e.isLeaving() || t.connectedPeer || t.connectionErrorReported || (t.connectionErrorReported = true, e.onJoinError?.({ error: Jc(n, e.config), appId: e.appId, peerId: n, roomId: e.roomId }));
}, qn = (e, t) => e[t] ??= Wc(), Fn = /* @__PURE__ */ new WeakMap(), Fr = (e) => {
  Fn.delete(e), e.answeringExpiryTimer = re(e.answeringExpiryTimer), e.answeringPeer = null, e.answerSent = false, e.answerReplay = null;
}, pn = (e, t) => {
  e.answeringPeer === t && (Fr(e), e.connectedPeer !== t && !t.isDead && t.destroy());
}, Yc = (e, t) => {
  e.answeringPeer && e.answeringPeer !== t && !e.answeringPeer.isDead && e.answeringPeer.destroy(), Fr(e), e.connectedPeer = t, e.connectedPeerUnhealthySinceMs = null;
}, rs = (e, t) => {
  e?.connectedPeer === t && (e.connectedPeer = null, e.connectedPeerUnhealthySinceMs = null);
}, zr = (e, t, n) => {
  e.connectedPeer && (e.connectedPeer.isDead || e.connectedPeer.destroy(), e.connectedPeer = null, e.connectedPeerUnhealthySinceMs = null);
}, _r = (e, t) => {
  e.offerRelayTimers[t] = re(e.offerRelayTimers[t]), e.offerRelays[t] && (e.offerRelays[t] = void 0);
}, Nr = (e, t) => {
  e?.offerRelays[t] === mn && _r(e, t);
}, Dt = (e) => {
  Fn.delete(e), e.offerExpiryTimer = re(e.offerExpiryTimer), e.offerInitPromise = null, e.offerRelays.forEach((t, n) => _r(e, n)), e.offerRelays = [], e.offerSignalRelays = [], e.offerRelayTimers = [], e.offerSignalBacklog = [], e.offerPeer && e.offerPeer !== e.connectedPeer && (e.offerPeer.isDead || e.offerPeer.destroy()), e.offerPeer = null, e.offerId = null, e.offerSdp = null, e.offerAnswered = false, e.connectionErrorReported = false;
}, Xc = (e, t, n, r) => {
  re(t.answeringExpiryTimer), t.answeringExpiryTimer = setTimeout(() => {
    let a = e.peerStates[n];
    !a || a.connectedPeer || a.answeringPeer !== r || (a.answerSent && Un(e, a, n), pn(a, r), e.checkDeactivate());
  }, _c);
}, Vr = (e, t, n, r = qc) => {
  re(t.offerExpiryTimer);
  let a = t.offerId;
  t.offerExpiryTimer = setTimeout(() => {
    let i = e.peerStates[n];
    !i || i.connectedPeer || i.offerId !== a || (i.offerAnswered && Un(e, i, n), Dt(i), e.checkDeactivate());
  }, r);
}, as = (e, t, n, r, a) => {
  let i = () => {
    t.offerPeer === r && !t.connectedPeer && (t.offerAnswered && Un(e, t, n), Dt(t)), e.disconnectPeer(r, n), e.checkDeactivate();
  };
  r.setHandlers({ connect: () => e.connectPeer(r, n), ...a ? { signal: a } : {}, close: i, error: i });
}, Zc = (e, t, n) => {
  if (t.offerPeer && t.offerId && t.offerSdp) return Promise.resolve({ peer: t.offerPeer, offer: t.offerSdp, offerId: t.offerId });
  if (t.offerInitPromise) return t.offerInitPromise;
  let r = (async () => {
    let a;
    try {
      a = (await e.offerManager.checkout(1, false, e.encryptOffer))[0];
    } catch (m) {
      if (e.isLeaving() || t.offerInitPromise !== r) return null;
      throw m;
    }
    if (!a) throw Z("failed to allocate offer peer");
    let { peer: i, offer: s } = a;
    return e.isLeaving() || t.offerInitPromise !== r ? (i.destroy(), null) : (t.offerPeer = i, t.offerId = It(Fc), t.offerSdp = s, t.offerAnswered = false, t.connectionErrorReported = false, t.offerSignalBacklog = [], as(e, t, n, i, (m) => {
      t.offerPeer === i && (t.offerSignalBacklog.push(m), t.offerSignalRelays.forEach((u) => u?.(m)));
    }), Vr(e, t, n), { peer: i, offer: s, offerId: t.offerId });
  })().finally(() => {
    t.offerInitPromise === r && (t.offerInitPromise = null);
  });
  return t.offerInitPromise = r;
}, is = async (e, t, n, r, a = 0) => {
  let i = e.peerStates[n];
  if (!i || i.connectedPeer || i.answeringPeer || i.offerAnswered) {
    Nr(i, t);
    return;
  }
  if (i.offerRelays[t] !== mn) return;
  let [s, m] = await Lt([Ht(jt(e.rootTopicPlaintext, n)), Zc(e, i, n)]);
  if (!m) {
    Nr(i, t);
    return;
  }
  if (e.isLeaving()) {
    Dt(i);
    return;
  }
  if (i.connectedPeer || i.answeringPeer || i.offerAnswered || i.offerRelays[t] !== mn) {
    Nr(i, t);
    return;
  }
  i.offerRelayTimers[t] = re(i.offerRelayTimers[t]), i.offerRelays[t] = true, i.offerRelayTimers[t] = setTimeout(() => {
    if (a >= 2 || e.isLeaving() || i.connectedPeer || i.answeringPeer || i.offerAnswered || i.offerPeer !== m.peer || i.offerId !== m.offerId) {
      nd(e, n, t);
      return;
    }
    i.offerRelays[t] = mn, is(e, t, n, r, a + 1);
  }, a === 0 && e.announceIntervals[t] === void 0 ? 2e3 : (e.announceIntervals[t] ?? e.announceIntervalMs) * 0.9);
  let u = false;
  i.offerSignalRelays[t] = (f) => {
    u && (e.isLeaving() || i.connectedPeer || i.offerPeer !== m.peer || i.offerId !== m.offerId || f.type !== "candidate" || Kc(e, f, s, r, (h) => ({ peerId: Oe, offerId: m.offerId, candidate: h, ...e.isPassive ? { passive: true } : {} }), () => !i.connectedPeer && i.offerPeer === m.peer && i.offerId === m.offerId));
  }, r(s, De({ peerId: Oe, offerId: m.offerId, offer: m.offer, ...e.isPassive ? { passive: true } : {} })), u = true, i.offerSignalBacklog.forEach((f) => i.offerSignalRelays[t]?.(f));
}, Qc = async (e, t, n, r, a, i) => {
  let s = qn(e.peerStates, n);
  if (s.answeringPeer || s.offerAnswered) {
    let g = s.answerReplay, T = g?.lastSentAt[t];
    if (s.answeringPeer && !s.answeringPeer.isDead && g && g.offer === r && g.offerId === a && (T === void 0 || Date.now() - T >= 1e3)) {
      g.lastSentAt[t] = Date.now();
      let S = await Ht(jt(e.rootTopicPlaintext, n));
      if (!e.isLeaving() && s.answerReplay === g && !s.connectedPeer) {
        let L = (C) => i(S, C);
        g.relays[t] = L, g.messages.forEach(L);
      }
    }
    return;
  }
  let m = !!(s.offerPeer || s.offerRelays.some(Boolean));
  if (m && Oe < n) return;
  m && Dt(s);
  let u = e.initPeer(false, e.config), f = { offer: r, offerId: a, messages: [], lastSentAt: [], relays: [] };
  f.lastSentAt[t] = Date.now(), s.answeringPeer = u, s.answerSent = false, s.answerReplay = f, s.connectionErrorReported = false, Xc(e, s, n, u);
  let h = () => {
    s.answeringPeer === u && !s.connectedPeer && s.answerSent && Un(e, s, n), pn(s, u), e.disconnectPeer(u, n), e.checkDeactivate();
  };
  u.setHandlers({ connect: () => e.connectPeer(u, n), close: h, error: h });
  let y;
  try {
    y = await e.toPlain({ type: "offer", sdp: r });
  } catch {
    pn(s, u), e.onJoinError?.({ error: "incorrect room password when decrypting offer", appId: e.appId, peerId: n, roomId: e.roomId });
    return;
  }
  if (u.isDead) {
    pn(s, u);
    return;
  }
  let k = await Ht(jt(e.rootTopicPlaintext, n));
  if (e.isLeaving() || s.answerReplay !== f) return;
  f.relays[t] = (g) => i(k, g);
  let D = [], w = false, x = (g) => {
    e.toCipher(g).then((T) => {
      if (e.isLeaving() || s.answeringPeer !== u || u.isDead) return;
      let S = { peerId: Oe };
      g.type === "answer" ? (s.answerSent = true, S.answer = T.sdp) : S.candidate = T.sdp, a && (S.offerId = a), e.isPassive && (S.passive = true);
      let L = De(S), C = Date.now();
      f.messages.push(L), f.relays.forEach((G, te) => {
        G && (f.lastSentAt[te] = C, G(L));
      }), g.type === "answer" && !w && (w = true, D.splice(0).forEach(x));
    });
  };
  u.setHandlers({ signal: (g) => {
    if (!(e.isLeaving() || s.answeringPeer !== u || u.isDead) && !(g.type !== "answer" && g.type !== "candidate")) {
      if (g.type === "candidate" && !w) {
        D.push(g);
        return;
      }
      x(g);
    }
  } }), await u.signal(y);
}, ed = async (e, t, n, r, a) => {
  let i;
  try {
    i = await e.toPlain({ type: Ti, sdp: n });
  } catch {
    return;
  }
  let s = e.peerStates[t], m = r && s?.offerPeer && s.offerId === r ? s.offerPeer : null, u = !r || s?.answerReplay?.offerId === r ? s?.answeringPeer : null, f = !r && s?.offerPeer ? s.offerPeer : null, h = a && !a.isDead ? a : m ?? u ?? f;
  h && !h.isDead && h.signal(i);
}, td = async (e, t, n, r, a) => {
  let i;
  try {
    i = await e.toPlain({ type: "answer", sdp: n });
  } catch {
    a && (e.offerManager.reclaimLeased(a), a.isDead || a.destroy()), e.onJoinError?.({ error: "incorrect room password when decrypting answer", appId: e.appId, peerId: t, roomId: e.roomId });
    return;
  }
  if (a) {
    let s = qn(e.peerStates, t);
    if (e.offerManager.claimLeased(a), s.connectedPeer || s.offerAnswered || s.answeringPeer && !s.answeringPeer.isDead && Oe > t) {
      a.destroy();
      return;
    }
    if (s.answeringPeer) {
      let m = s.answeringPeer;
      pn(s, m);
    }
    Dt(s), s.offerPeer = a, s.offerId = r ?? null, s.offerAnswered = true, Vr(e, s, t, Qi), as(e, s, t, a), a.signal(i);
  } else {
    let s = e.peerStates[t];
    if (!s || !s.offerPeer || s.offerAnswered || r && s.offerId && r !== s.offerId || s.offerPeer.isDead) return;
    s.offerAnswered = true, Vr(e, s, t, Qi), s.offerPeer.signal(i);
  }
}, nd = (e, t, n) => {
  let r = e.peerStates[t];
  !r || r.connectedPeer || r.offerRelays[n] && (_r(r, n), e.checkDeactivate());
}, rd = (e) => (t) => async (n, r, a) => {
  if (e.isLeaving()) return;
  let i = es(r);
  if (!i || ns(i, typeof r == "string")) return;
  let s = ht(i, "peerId") ?? "", m = ht(i, "offer"), u = ht(i, "answer"), f = ht(i, "candidate"), h = ht(i, "offerId"), y = ts(i.peer) ? i.peer : void 0, k = i.passive === true;
  if (!s || s === Oe) return;
  let [D, w] = await Lt([e.rootTopicP, e.selfTopicP]);
  if (e.isLeaving() || n !== D && n !== w || e.isPassive && k || (e.isPassive && !e.isActive && !u && !f && (e.isActive = true, e.requeueAnnounce?.()), e.isPassive && !e.isActive)) return;
  let x = e.peerStates[s], g = x?.connectedPeer;
  if (g && x) {
    let T = Hc(g);
    if (T === "live") {
      x.connectedPeerUnhealthySinceMs = null;
      return;
    }
    if (T === "stale") zr(x, s, "message-from-stale-peer");
    else {
      let S = Date.now(), L = x.connectedPeerUnhealthySinceMs ?? S;
      if (x.connectedPeerUnhealthySinceMs = L, S - L < zc) return;
      zr(x, s, "message-from-prolonged-disconnect");
    }
  }
  if (!e.reusePeer(s)) {
    if (s && !m && !u && !f) {
      let T = qn(e.peerStates, s), S = Oe < s;
      if (T.answeringPeer || T.connectedPeer || T.offerAnswered) return;
      if (!S && !T.offerPeer) {
        let L = Fn.get(T);
        L || (L = [], Fn.set(T, L));
        let C = L[t];
        if (C !== void 0 && Date.now() - C < 1e3) return;
        L[t] = Date.now();
        let G = await Ht(jt(e.rootTopicPlaintext, s));
        !e.isLeaving() && !T.connectedPeer && !T.answeringPeer && !T.offerAnswered && a(G, De({ peerId: Oe }));
        return;
      }
      return T.offerRelays[t] ? void 0 : (T.offerRelays[t] = mn, is(e, t, s, a));
    }
    if (m) return Qc(e, t, s, m, h, a);
    if (f) return ed(e, s, f, h, y);
    if (u) return td(e, s, u, h, y);
  }
}, zn = 5333, ad = [233, 533, 1333], ss = 7533, id = 123333, sd = ({ init: e, subscribe: t, announce: n, deactivate: r }) => {
  let a = {}, i = {}, s = new Uc(), m = () => Qe(a).some((y) => Ve(y).length > 0), u = false, f = [], h = Se;
  return (y, k, D) => {
    if (!y) throw Z("requires a config map as the first argument");
    if (D && typeof D != "object") throw Z("third argument must be a callbacks object");
    let { appId: w } = y, x = D?.onJoinError, g = D?.onPeerHandshake, T = D?.handshakeTimeoutMs;
    if (!w) throw Z("config map is missing appId field");
    if (!k) throw Z("roomId argument required");
    if (y.maxReceiveBytes !== void 0 && (!Number.isSafeInteger(y.maxReceiveBytes) || y.maxReceiveBytes <= 0)) throw Z("maxReceiveBytes must be a positive safe integer");
    if (T !== void 0 && (!Number.isFinite(T) || T <= 0)) throw Z("handshakeTimeoutMs must be a positive number");
    if (a[w]?.[k]) return a[w][k];
    i[w]?.[k]?.(true);
    let S = jt(Ie, w, k), L = Ht(S), C = Ht(jt(S, Oe)), G = rc(y.password ?? "", w, k), te = ac(w, k), ae = y._test_only_sharedPeerIdleMs ?? id, Y = false, ie = (le) => async (oe) => ({ type: oe.type, sdp: await le(G, oe.sdp) }), fe = ie(sc), se = ie(ic), z = () => Ri(true, y), p = false, E = new lc(z), R = async (le) => {
      let oe = await le.getOffer();
      if (!oe || oe.type !== "offer") throw Z("failed to get offer for peer");
      return (await se(oe)).sdp;
    }, j = (le, oe) => {
      Le.connect(oe, le, ae);
    }, _ = false, O = () => {
      M || !p || _ || (_ = true, queueMicrotask(() => {
        _ = false, Y || Q.requeueAnnounce?.();
      }));
    }, P = (le, oe) => {
      if (Y) return;
      let me = Q.peerStates[oe];
      me?.connectedPeer === le && (zr(me, oe, "close-event"), ue(), O());
    }, M = !!y.passive, q, J = Se, ue = () => {
      if (!M || !Q.isActive) return;
      let le = false;
      Bt(Q.peerStates).forEach(([oe, me]) => {
        me.connectedPeer || me.answeringPeer || me.offerInitPromise || me.offerPeer || me.offerRelays.some(Boolean) ? le = true : delete Q.peerStates[oe];
      }), le || (Q.isActive = false, q = re(q), Me.forEach(re), Me.length = 0, J(), Le.setActive(false));
    }, Q = { appId: w, roomId: k, config: y, peerStates: {}, rootTopicPlaintext: S, rootTopicP: L, selfTopicP: C, toPlain: fe, toCipher: se, isLeaving: () => Y, isPassive: M, isActive: !M, onJoinError: x, offerManager: E, encryptOffer: R, initPeer: Ri, connectPeer: j, disconnectPeer: P, reusePeer: (le) => Le.reuse(le), checkDeactivate: ue, announceIntervals: [], announceIntervalMs: zn }, be = { config: y, appId: w, roomId: k, isPassive: M }, we = rd(Q);
    if (!u) {
      let le = e(y);
      f = (Array.isArray(le) ? le : [le]).map((oe) => Promise.resolve(oe)), u = true, h = y.relayConfig?.manualReconnection ? Se : Ql();
    }
    let Pe = f.map(() => zn), Ce = f.map(() => 0), qe = f.map(() => 0), Me = [], o = f.map(async (le, oe) => t(await le, await L, await C, we(oe), (me) => E.getOffers(me, R), be));
    Lt([L, C]).then(([le, oe]) => {
      if (Y) return;
      let me = async (Fe, ke) => {
        if (Y || M && !Q.isActive) return;
        let St = M ? { passive: true } : void 0, ze;
        try {
          ze = await n(Fe, le, oe, St, be), qe[ke] = 0;
        } catch (el) {
          if (Y) return;
          let Ba = qe[ke] ?? 0;
          Ba === 0 && y.relayConfig?.warnOnRelayFailure !== false && console.warn(`${Ie}: announce failed - ${Ot(el, "")}`), qe[ke] = Ba + 1;
        }
        if (Y || M && !Q.isActive || ze && typeof ze != "number" && "stopAnnouncing" in ze) return;
        typeof ze == "number" ? (Q.announceIntervals[ke] = ze, Pe[ke] = ze) : ze && (Pe[ke] = ze.nextAnnounceMs, p ||= ze.reannounceOnDisconnect === true);
        let fr = Ce[ke] ?? 0;
        Ce[ke] = fr + 1;
        let $a = Pe[ke] ?? zn, Ca = ad[fr] ?? (fr === 3 && typeof ze == "object" ? zn : void 0);
        Me[ke] = setTimeout(() => {
          me(Fe, ke);
        }, typeof Ca == "number" ? Math.min($a, Ca) : $a);
      };
      J = () => {
        r && f.forEach(async (Fe) => {
          let ke = await Fe;
          Y || r(ke, le, oe, be);
        });
      }, Q.requeueAnnounce = () => {
        Me.forEach(re), Me.length = 0, q = re(q), Le.setActive(true), q = setTimeout(ue, ss), f.forEach(async (Fe, ke) => {
          let St = await Fe;
          St && !Y && (Ce[ke] = 0, me(St, ke));
        });
      }, o.forEach(async (Fe, ke) => {
        if (await Fe, Y) return;
        let St = await f[ke];
        St && !Y && (!M || Q.isActive) && me(St, ke);
      });
    });
    let d = Se, b = y.password ?? "", { compose: A } = cc(b, w, k), B = A(g), F = () => {
      a[w]?.[k] === de && (delete a[w][k], Ve(a[w]).length === 0 && delete a[w]);
    }, $ = () => {
      i[w]?.[k] === U && (delete i[w][k], Ve(i[w]).length === 0 && delete i[w]);
    }, U = (le = false) => {
      Y || (Y = true, d = Se, F(), $(), Le.leave(), Bt(Q.peerStates).forEach(([oe, me]) => {
        me.connectedPeer && !me.connectedPeer.isDead && (s.owns(w, oe, me.connectedPeer) || me.connectedPeer.destroy()), me.answeringPeer && !me.answeringPeer.isDead && me.answeringPeer.destroy(), Dt(me), Fr(me), me.connectedPeer = null, me.connectedPeerUnhealthySinceMs = null;
      }), Me.forEach(re), q = re(q), o.forEach(async (oe) => {
        (await oe)();
      }), E.destroy(), !(le || m()) && (u = false, h()));
    }, ee = { ...y.maxReceiveBytes === void 0 ? {} : { maxReceiveBytes: y.maxReceiveBytes }, ...B ? { onPeerHandshake: B } : {}, ...T === void 0 ? {} : { handshakeTimeoutMs: T }, isPassive: M, onBeforeLeave: () => {
      F(), (i[w] ??= {})[k] = U;
    }, onHandshakeError: (le, oe) => x?.({ error: oe.replace(/^handshake failed: /, ""), appId: w, peerId: le, roomId: k }) };
    a[w] ??= {};
    let de = Bc((le) => d = le, (le) => {
      if (Y) return;
      let oe = Q.peerStates[le];
      oe?.connectedPeer && rs(oe, oe.connectedPeer), ue(), O();
    }, () => U(false), ee), Le = s.registerRoom(w, k, te, { active: !M || Q.isActive, onPeer: (le, oe, me) => {
      let Fe = qn(Q.peerStates, oe);
      Yc(Fe, me), M && !Q.isActive && (Q.isActive = true, Le.setActive(true), Q.requeueAnnounce ? Q.requeueAnnounce() : (q = re(q), q = setTimeout(ue, ss))), d(le, oe), Dt(Fe);
    }, onDetach: (le, oe) => {
      rs(Q.peerStates[le], oe), ue();
    } });
    return a[w][k] = de;
  };
}, od = 2e4, Kr = (e) => {
  if (!e) throw Z("topic strategy missing room context");
  return e;
}, fn = (e, t, n, r) => ({ kind: t, appId: e.appId, roomId: e.roomId, rootTopic: n, selfTopic: r }), ld = ({ steadyAnnounceIntervalMs: e = od, reannounceOnDisconnect: t = true, init: n, subscribeTopic: r, publishTopic: a, unpublishTopic: i }) => sd({ init: n, subscribe: async (s, m, u, f, h, y) => {
  let k = Kr(y), D = (G, te) => {
    a(s, G, te, fn(k, "signal", m, u));
  }, w = null, x = false, g = null, T = false, S = (G) => {
    x || (x = true, G());
  }, L = () => (g || (g = Promise.resolve(r(s, u, (G, te) => {
    T || f(G, te, D);
  }, fn(k, "self", m, u))).then((G) => {
    w = G, T && S(G);
  })), g);
  k.isPassive || await L();
  let C = await r(s, m, async (G, te) => {
    T || (k.isPassive && Vc(te) && await L(), T || await f(G, te, D));
  }, fn(k, "root", m, u));
  return () => {
    T = true, w && S(w), C();
  };
}, announce: async (s, m, u, f, h) => {
  let y = Kr(h), k = await a(s, m, De({ peerId: Oe, ...f }), fn(y, "announce", m, u));
  return typeof k == "number" || k !== void 0 && "stopAnnouncing" in k ? k : { nextAnnounceMs: k?.nextAnnounceMs ?? e, reannounceOnDisconnect: k?.reannounceOnDisconnect ?? t };
}, ...i ? { deactivate: (s, m, u, f) => {
  let h = Kr(f);
  return i(s, m, fn(h, "announce", m, u));
} } : {} }), Wr = Zl((e) => e.socket), cd = 5, os = "x", ls = "EVENT", { secretKey: dd, publicKey: ud } = bi.keygen(), md = an(ud), pd = {}, cs = 250, Mt = 2e4, fd = 9e5, Gr = 5333, gn = /* @__PURE__ */ new WeakMap(), _n = Wr.scoped(), Jr = /* @__PURE__ */ new WeakSet(), gd = (e) => {
  let t = gn.get(e), n = Math.min(t?.delayMs ? Math.max(Mt, t.delayMs * 2) : Mt, fd);
  return gn.set(e, { delayMs: n, untilMs: Date.now() + n }), n;
}, hn = (e) => {
  let t = gn.get(e);
  if (!t) return 0;
  let n = t.untilMs - Date.now();
  return n > 0 ? n : 0;
}, Nn = (e) => ({ nextAnnounceMs: e }), hd = { stopAnnouncing: true }, yd = (e) => Jr.has(e) ? false : (Jr.add(e), gn.delete(e), e.close?.(), true), ds = () => Math.floor(networkNow() / 1e3), us = (e) => pd[e] ??= Pi(e, 1e4) + 2e4, vd = async (e, t) => {
  await refreshNetworkTime();
  let n = { kind: us(e), tags: [[os, e]], created_at: ds(), content: t, pubkey: md }, r = await $n("SHA-256", De([0, n.pubkey, n.created_at, n.kind, n.tags, n.content]));
  return De([ls, { ...n, id: an(r), sig: an(await bi.signAsync(r, dd)) }]);
}, Ke = {}, ms = (e) => {
  e.flushWaiters.forEach((t) => t()), e.flushWaiters.clear();
}, bd = (e, t, n) => {
  let r = Ke[e.url] ??= { subIds: [], topics: /* @__PURE__ */ new Map(), updateTimer: null, flushWaiters: /* @__PURE__ */ new Set(), retryTimer: null, retryMs: Gr, pendingEose: /* @__PURE__ */ new Set(), requestedAt: 0 };
  r.topics.set(t, n), ps(e, r);
}, wd = (e, t) => {
  let n = Ke[e.url];
  n && (n.topics.delete(t), delete _n.forRelay(e)[t], n.topics.size === 0 ? (n.retryTimer !== null && clearTimeout(n.retryTimer), n.updateTimer !== null && (clearTimeout(n.updateTimer), n.updateTimer = null), ms(n), n.subIds.forEach((r) => e.send(De(["CLOSE", r]))), delete Ke[e.url]) : ps(e, n));
}, ps = (e, t) => {
  t.updateTimer === null && (t.updateTimer = setTimeout(() => {
    t.updateTimer = null;
    try {
      fs(e);
    } finally {
      ms(t);
    }
  }, 0));
}, kd = (e) => {
  let t = Ke[e.url];
  return !t || t.updateTimer === null ? Promise.resolve() : new Promise((n) => t.flushWaiters.add(n));
}, fs = (e) => {
  let t = Ke[e.url];
  if (!t || t.topics.size === 0) return;
  // Older clients may still use their unadjusted device clock to timestamp announcements.
  let n = [...t.topics.keys()], r = [], a = Math.max(0, ds() - 300);
  for (let i = 0; i < n.length; i += cs) r.push(n.slice(i, i + cs));
  for (; t.subIds.length > r.length; ) {
    let i = t.subIds.pop();
    i && e.send(De(["CLOSE", i]));
  }
  t.pendingEose.clear(), t.requestedAt = Date.now(), r.forEach((i, s) => {
    let m = t.subIds[s] ??= It(64);
    t.pendingEose.add(m), e.send(De(["REQ", m, { kinds: [...new Set(i.map(us))], since: a, "#x": i }]));
  });
}, gs = (e) => {
  let t = Ke[e.url];
  if (t && t.topics.size > 0 && !e.isClosed) {
    if (hn(e) > 0) {
      vs(e, true);
      return;
    }
    t.retryTimer !== null && (clearTimeout(t.retryTimer), t.retryTimer = null), fs(e), hs(e);
  }
}, hs = (e) => {
  Object.entries(_n.forRelay(e)).forEach(([t, n]) => {
    ys(e, t, n, true);
  });
}, ys = async (e, t, n, r) => {
  if (Jr.has(e) || e.isClosed) return r ? hd : void 0;
  let a = hn(e);
  if (a > 0 || e.socket.readyState !== 1) return r ? Nn(Math.max(Mt, a)) : void 0;
  let i = await vd(t, r ? De({ ...sn(n), nonce: It(8) }) : n);
  if (r && !Ke[e.url]?.topics.has(t)) return Nn(Mt);
  if (hn(e) > 0 || e.isClosed || e.socket.readyState !== 1) return r ? Nn(Mt) : void 0;
  if (e.send(i), r) return Nn(Mt);
}, vs = (e, t) => {
  let n = Ke[e.url];
  if (!n || n.retryTimer !== null && !t) return;
  n.retryTimer !== null && clearTimeout(n.retryTimer);
  let r = t ? hn(e) : n.retryMs;
  n.retryMs = Math.min(n.retryMs * 2, Mt), n.retryTimer = setTimeout(() => {
    n.retryTimer = null, gs(e);
  }, Math.max(r, Gr));
}, xd = ld({ init: (e) => Wl(e, Td, cd, true).map((t) => {
  let n = Wr.register(t, () => Xl(t, (r) => {
    let [a, i, s, m] = sn(r);
    if (a !== ls) {
      let u = `${Ie}: relay failure from ${n.url} - `, f = a === "CLOSED" && typeof s == "string" ? s : m, h = a === "OK" && s === false, y = (h || a === "CLOSED") && f?.startsWith("rate-limited:"), k = h && f?.startsWith("duplicate:"), D = f && /^(blocked|restricted|auth-required|pow):/.test(f);
      if (a === "OK" && s === true && hn(n) === 0 && gn.delete(n), (h || a === "CLOSED") && D && !yd(n)) return;
      if (y) gd(n);
      else if (a === "EOSE") {
        let w = Ke[n.url];
        w?.pendingEose.delete(i) && w.pendingEose.size === 0 && (w.retryMs = Gr, w.retryTimer !== null && (clearTimeout(w.retryTimer), w.retryTimer = null), Date.now() - w.requestedAt >= 1e3 && hs(n));
      }
      a === "CLOSED" && !D && vs(n, !!y), !k && e.relayConfig?.warnOnRelayFailure !== false && (a === "NOTICE" ? console.warn(u + i) : (h || a === "CLOSED") && console.warn(u + f));
      return;
    }
    if (s && typeof s == "object" && "content" in s) {
      let u = Ke[n.url];
      if (u?.subIds.includes(i) && s.tags) {
        let f = s.tags.find((h) => h[0] === os);
        f?.[1] && u.topics.get(f[1])?.(f[1], s.content);
      }
    }
  }, () => gs(n)));
  return n.ready;
}), subscribeTopic: (e, t, n, r) => {
  let a = (s, m) => {
    n(s, m);
  };
  bd(e, t, a);
  let i = () => {
    Ke[e.url]?.topics.get(t) === a && wd(e, t);
  };
  return r.kind === "root" ? kd(e).then(() => i) : i;
}, publishTopic: (e, t, n, { kind: r }) => {
  let a = typeof n == "string" ? n : De(n);
  return r === "announce" && (_n.forRelay(e)[t] = a), ys(e, t, a, r === "announce");
}, unpublishTopic: (e, t) => {
  delete _n.forRelay(e)[t];
} }), Sd = Wr.getSockets, Td = ["0x-nostr-relay.fly.dev", "bendernostur.duckdns.org:8443", "cdn.satellite.earth", "nos.lol", "nostr.chaima.info", "nostr.christiansass.de", "nostr.rblb.it", "nostr.red5d.dev", "nostr.robosats.org", "nostr.stakey.net", "nostrcity-club.fly.dev", "relay-dev.gulugulu.moe", "relay.aarpia.com", "relay.agentry.com", "relay.bitmacro.cloud", "relay.bullishbounty.com", "relay.degmods.com", "relay.flashapp.me", "relay.grigic.org", "relay.hackshed.dev", "relay.kaleidoswap.com", "relay.layer.systems", "relay.nostr.blockhenge.com", "relay.nostr.dev.br", "relay.nostrmap.net", "relay.novospes.com", "relay.piazza.today", "relay.routstr.com", "testr.nymble.world"].map((e) => "wss://" + e), Yr = () => {
  let e = Object.values(Sd?.() || {});
  return { open: e.filter((t) => t?.readyState === WebSocket.OPEN).length, total: e.length };
}, Pd = "pulse-v1", ws = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302", "stun:stun.cloudflare.com:3478", "stun:stun.sipnet.ru:3478", "stun:stun.ekiga.net:3478"], Vn = (e, t, n) => {
  let r = new RegExp(`(^|;)\\s*${t}=[^;]*`), a = `${t}=${n}`;
  return r.test(e) ? e.replace(r, `$1${a}`) : e ? `${e};${a}` : a;
}, Id = (e, { ptime: t = 10, bitrate: n = 64e3 } = {}) => {
  if (!e || typeof e != "string") return e;
  let r = e.includes(`\r
`) ? `\r
` : `
`;
  return e.split(new RegExp(`${r}(?=m=)`)).map((a) => {
    if (!a.startsWith("m=audio")) return a;
    let i = a.match(/a=rtpmap:(\d+) opus\/48000/i);
    if (!i) return a;
    let s = i[1], m = a.split(r).filter((h) => !/^a=(max)?ptime:/.test(h)), u = false;
    if (m = m.map((h) => {
      if (!h.startsWith(`a=fmtp:${s} `)) return h;
      u = true;
      let y = h.slice(`a=fmtp:${s} `.length);
      return y = Vn(y, "minptime", t), y = Vn(y, "useinbandfec", 1), y = Vn(y, "usedtx", 0), y = Vn(y, "maxaveragebitrate", n), `a=fmtp:${s} ${y}`;
    }), !u) {
      let h = m.findIndex((y) => y.startsWith(`a=rtpmap:${s} `));
      m.splice(h + 1, 0, `a=fmtp:${s} minptime=${t};useinbandfec=1;usedtx=0;maxaveragebitrate=${n}`);
    }
    let f = m[m.length - 1] === "" ? m.pop() : null;
    return m.push(`a=ptime:${t}`, `a=maxptime:${Math.max(t, 20)}`), f !== null && m.push(f), m.join(r);
  }).join(r);
}, ks = { ptime: 10, bitrate: 64e3 }, Ld = class extends RTCPeerConnection {
  setRemoteDescription(e, ...t) {
    return e && e.sdp && (e = { type: e.type, sdp: Id(e.sdp, ks) }), super.setRemoteDescription(e, ...t);
  }
}, Ed = () => "pulse-" + Va(crypto.getRandomValues(new Uint8Array(18))), Dd = new RegExp(`(?:^|[^A-Za-z0-9-])(pulse-${kl}{16,40})(?![A-Za-z0-9-])`), xs = (e) => {
  const text = String(e ?? "").trim();
  const codeLine = [...text.matchAll(/^Код:[ \t]*([^\r\n]*)/gimu)].at(-1);
  if (codeLine) {
    const code = codeLine[1].trim();
    return code.match(Dd)?.[1] === code ? code : null;
  }
  return text.match(Dd)?.[1] ?? null;
}, Md = async (e) => {
  let t = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
  return [...new Uint8Array(t)].map((n) => n.toString(16).padStart(2, "0")).join("");
}, Ss = async (e, t, n) => {
  let r = (await Md(`pulse-room:${e}`)).slice(0, 40);
  ks = { ptime: t.lowLatency ? 10 : 20, bitrate: Number(t.audioBitrate) || 64e3 };
  let a = relayUrls(t.relays), i = (t.stun?.length ? t.stun : ws).map((s) => ({ urls: s }));
  return t.turnUrl && i.push({ urls: t.turnUrl, username: t.turnUser || void 0, credential: t.turnPass || void 0 }), xd({ appId: Pd, password: e, relayConfig: { urls: a, redundancy: a.length, warnOnRelayFailure: false }, rtcConfig: { iceServers: i, iceCandidatePoolSize: 4, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" }, rtcPolyfill: Ld, maxReceiveBytes: 512 * 1024 * 1024 }, r, n);
}, Ad = async (e) => {
  if (!e || e.connectionState === "closed") return null;
  let t = await e.getStats(), n = null, r = /* @__PURE__ */ new Map();
  t.forEach((h) => {
    r.set(h.id, h), h.type === "transport" && h.selectedCandidatePairId && (n = h.selectedCandidatePairId);
  });
  let a = n ? r.get(n) : null;
  a || t.forEach((h) => {
    h.type === "candidate-pair" && h.nominated && h.state === "succeeded" && (a = h);
  });
  let i = 0, s = 0, m = null;
  if (t.forEach((h) => {
    h.type === "inbound-rtp" && h.kind === "audio" && (m = h);
  }), m) {
    let h = m.packetsReceived + m.packetsLost;
    i = h > 0 ? m.packetsLost / h : 0, s = m.jitter || 0;
  }
  let u = a ? r.get(a.localCandidateId) : null, f = a ? r.get(a.remoteCandidateId) : null;
  return { rtt: a?.currentRoundTripTime ?? null, relayed: u?.candidateType === "relay" || f?.candidateType === "relay", localType: u?.candidateType, remoteType: f?.candidateType, protocol: u?.protocol, loss: i, jitter: s, audioIn: m };
}, Xr = (e) => {
  let t = (n) => {
    let r = n?.match(/a=fingerprint:sha-256 ([0-9A-F:]+)/i);
    return r ? r[1].toUpperCase() : null;
  };
  return { local: t(e?.localDescription?.sdp), remote: t(e?.remoteDescription?.sdp) };
}, Ts = /* @__PURE__ */ new WeakMap(), Ps = (e) => {
  if (e) for (let t of e.getSenders()) {
    let n = t.track?.kind;
    if (!(!n || Ts.get(t) === t.track.id)) {
      Ts.set(t, t.track.id);
      try {
        let r = t.getParameters();
        if (!r.encodings?.length) continue;
        r.encodings.forEach((a) => {
          a.priority = n === "audio" ? "high" : "medium", a.networkPriority = n === "audio" ? "high" : "medium";
        }), n === "video" && (r.degradationPreference = t.track.contentHint === "detail" ? "maintain-resolution" : "maintain-framerate"), t.setParameters(r).catch(() => {
        });
      } catch {
      }
    }
  }
}, Rd = () => {
  let e = new Float32Array(8192), t = 0.85;
  for (let n = 0; n < 8192; n++) {
    let r = (n / 8191 * 2 - 1) * 4, a = Math.abs(r), i = a <= t ? a : t + (1 - t) * Math.tanh((a - t) / (1 - t));
    e[n] = Math.sign(r) * i;
  }
  return e;
}, Is = (e) => {
  let t = e._buf || (e._buf = new Float32Array(e.fftSize));
  e.getFloatTimeDomainData(t);
  let n = 0;
  for (let r = 0; r < t.length; r++) n += t[r] * t[r];
  return Math.sqrt(n / t.length);
}, $d = class {
  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48e3 }), this.master = this.ctx.createGain(), this.pre = this.ctx.createGain(), this.pre.gain.value = 1 / 4, this.clipper = this.ctx.createWaveShaper(), this.clipper.curve = Rd(), this.clipper.oversample = "none", this.master.connect(this.pre), this.pre.connect(this.clipper), this.clipper.connect(this.ctx.destination), this.masterVolume = 1, this.deafened = false, this.sources = /* @__PURE__ */ new Map(), this.peerVolumes = /* @__PURE__ */ new Map(), this.peerMuted = /* @__PURE__ */ new Map(), this.mic = null, this.micGainValue = 1, this.monitor = null;
  }
  resume() {
    if (this.ctx.state !== "running") return this.ctx.resume().catch(() => {
    });
  }
  async setOutputDevice(e) {
    if (typeof this.ctx.setSinkId == "function") try {
      await this.ctx.setSinkId(e || "");
    } catch (t) {
      console.warn("setSinkId failed", t);
    }
  }
  setMasterVolume(e) {
    this.masterVolume = e, this.applyMaster();
  }
  setDeafened(e) {
    this.deafened = e, this.applyMaster();
  }
  applyMaster() {
    let e = this.deafened ? 0 : this.masterVolume;
    this.master.gain.setTargetAtTime(e, this.ctx.currentTime, 0.01);
  }
  attach(e, t, n) {
    if (this.detach(e), !n.getAudioTracks().length) return;
    let r = new Audio();
    r.muted = true, r.srcObject = n, r.play().catch(() => {
    });
    let a = this.ctx.createMediaStreamSource(n), i = this.ctx.createGain(), s = this.ctx.createAnalyser();
    s.fftSize = 512, a.connect(i), i.connect(this.master), a.connect(s), this.sources.set(e, { peerId: t, el: r, src: a, gain: i, analyser: s, stream: n }), this.applyPeer(t);
  }
  detach(e) {
    let t = this.sources.get(e);
    if (t) {
      try {
        t.src.disconnect(), t.gain.disconnect();
      } catch {
      }
      t.el.srcObject = null, this.sources.delete(e);
    }
  }
  detachPeer(e) {
    for (let [t, n] of this.sources) n.peerId === e && this.detach(t);
  }
  setPeerVolume(e, t) {
    this.peerVolumes.set(e, t), this.applyPeer(e);
  }
  setPeerMuted(e, t) {
    this.peerMuted.set(e, t), this.applyPeer(e);
  }
  applyPeer(e) {
    let t = this.peerMuted.get(e) ? 0 : this.peerVolumes.get(e) ?? 1;
    for (let n of this.sources.values()) n.peerId === e && n.gain.gain.setTargetAtTime(t, this.ctx.currentTime, 0.01);
  }
  peerLevel(e) {
    let t = 0;
    for (let n of this.sources.values()) n.peerId === e && (t = Math.max(t, Is(n.analyser)));
    return t;
  }
  async startMic({ deviceId: e, echoCancellation: t, noiseSuppression: n, autoGainControl: r }) {
    const request = this.micRequest = {};
    const a = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: e ? { exact: e } : void 0, echoCancellation: t, noiseSuppression: n, autoGainControl: r, channelCount: 1, sampleRate: 48e3, latency: 0 }, video: false });
    if (this.micRequest !== request) {
      // The room may have changed while the permission prompt was open.
      a.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stopMic();
    const i = a.getAudioTracks()[0];
    i.contentHint = "speech";
    let s = i.clone(), m = this.ctx.createMediaStreamSource(new MediaStream([s])), u = this.ctx.createAnalyser();
    u.fftSize = 512, m.connect(u);
    let f = this.ctx.createMediaStreamSource(a), h = this.ctx.createGain();
    h.gain.value = this.micGainValue;
    let y = this.ctx.createMediaStreamDestination();
    y.channelCount = 1, f.connect(h), h.connect(y);
    let k = y.stream.getAudioTracks()[0];
    return k.contentHint = "speech", this.mic = { raw: a, rawTrack: i, analysisTrack: s, analysisSrc: m, analyser: u, src: f, gain: h, dest: y, boostedTrack: k }, this.mic;
  }
  stopMic() {
    this.micRequest = null;
    if (!this.mic) return;
    let e = this.mic;
    this.setMonitor(false);
    try {
      e.analysisSrc.disconnect(), e.src.disconnect(), e.gain.disconnect();
    } catch {
    }
    e.rawTrack.stop(), e.analysisTrack.stop(), e.boostedTrack.stop(), this.mic = null;
  }
  setMicGain(e) {
    this.micGainValue = e, this.mic && this.mic.gain.gain.setTargetAtTime(e, this.ctx.currentTime, 0.01);
  }
  micSendTrack() {
    return this.mic ? Math.abs(this.micGainValue - 1) < 0.01 ? this.mic.rawTrack : this.mic.boostedTrack : null;
  }
  micLevel() {
    return this.mic ? Is(this.mic.analyser) * this.micGainValue : 0;
  }
  setMonitor(e) {
    if (this.monitor) {
      try {
        this.monitor.disconnect();
      } catch {
      }
      this.monitor = null;
    }
    e && this.mic && (this.monitor = this.ctx.createGain(), this.mic.gain.connect(this.monitor), this.monitor.connect(this.ctx.destination));
  }
  beep(e) {
    let t = { join: [[520, 0], [780, 0.09]], leave: [[620, 0], [410, 0.09]], message: [[880, 0]], mute: [[360, 0]], unmute: [[560, 0]], ring: [[660, 0], [880, 0.14], [660, 0.28], [990, 0.42]], dial: [[440, 0], [440, 0.2]], request: [[700, 0], [940, 0.1], [1180, 0.2]] }[e];
    if (!t || this.deafened) return;
    let n = this.ctx.currentTime;
    for (let [r, a] of t) {
      let i = this.ctx.createOscillator(), s = this.ctx.createGain();
      i.type = "sine", i.frequency.value = r, s.gain.setValueAtTime(0, n + a), s.gain.linearRampToValueAtTime(e === "ring" ? 0.18 : 0.12, n + a + 0.01), s.gain.exponentialRampToValueAtTime(1e-4, n + a + 0.16), i.connect(s), s.connect(this.ctx.destination), i.start(n + a), i.stop(n + a + 0.18);
    }
  }
  startLoop(e, t) {
    this.stopLoop(), this.beep(e), this.loopTimer = setInterval(() => this.beep(e), t);
  }
  stopLoop() {
    clearInterval(this.loopTimer), this.loopTimer = null;
  }
}, qt = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "🎉"], Ls = (e) => e?.type?.startsWith("image/") && e.type !== "image/svg+xml", yn = (e) => e.kind === "voice" ? `🎤 Голосовое ${Dn(e.file?.dur)}` : e.kind === "circle" ? `⚪ Кружочек ${Dn(e.file?.dur)}` : e.kind === "file" ? Ls(e.file) ? "🖼 Фото" : `📎 ${e.file?.name || "файл"}` : (e.text || "").replace(/\s+/g, " ").slice(0, 120), Cd = (e) => String(e ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "файл", Es = (e, t) => {
  if (!e || typeof e != "object") return null;
  let n = typeof e.type == "string" && /^[\w.+-]+\/[\w.+-]+$/.test(e.type) ? e.type : "application/octet-stream";
  if (t === "voice" && !/^audio\//.test(n) || t === "circle" && !/^video\//.test(n)) return null;
  let r = { name: Cd(e.name), size: Math.max(0, Math.min(Number(e.size) || 0, 2 ** 32)), type: n };
  return (t === "voice" || t === "circle") && (r.dur = Math.max(0, Math.min(Number(e.dur) || 0, 900)), Array.isArray(e.peaks) && (r.peaks = e.peaks.slice(0, 64).map((a) => Math.max(0, Math.min(100, Math.round(Number(a) || 0)))))), r;
}, Ds = (e) => !e || typeof e != "object" || typeof e.id != "string" || !/^[0-9a-f]{8,40}$/.test(e.id) ? null : { id: e.id, name: String(e.name ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 32), text: String(e.text ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, "").slice(0, 120) }, Bd = (e) => ({ pending: "clock", sent: "check", delivered: "check2" })[e], Od = { pending: "Ждёт, когда друг будет в сети", sent: "Отправлено", delivered: "Доставлено" }, Zr = (e, t) => {
  let n = t.status?.(e);
  return I("span", { class: "meta", title: Od[n] || "" }, I("span", { class: "meta-time", text: ll(e.ts) }), n ? ne(Bd(n)) : null);
}, jd = (e, t) => I("div", { class: `media-loading ml-${e.kind}` }, I("div", { class: "spinner" }), I("span", { text: `${t} ${Math.round((e.progress || 0) * 100)}%` })), Hd = (e) => e.kind === "voice" ? I("div", { class: "media-gone" }, ne("mic"), "Голосовое недоступно на этом устройстве") : e.kind === "circle" ? I("div", { class: "media-gone circle" }, ne("cam"), "Кружочек недоступен") : I("div", { class: "file-card" }, I("div", { class: "file-ic" }, ne("clip")), I("div", { class: "fc-main" }, I("div", { class: "fc-name", text: e.file?.name || "файл" }), I("div", { class: "fc-sub", text: `${Ha(e.file?.size || 0)} · был отправлен раньше` }))), Ms = (e, t) => {
  let n = I("div", { class: `slot slot-${e.kind}` });
  return !e.mine && e.progress != null && e.progress < 1 ? (n.append(jd(e, "получение")), n) : (n.append(I("div", { class: `media-loading ml-${e.kind}` }, I("div", { class: "spinner" }))), Promise.resolve(t.getUrl(e)).then((r) => {
    if (!r) {
      n.replaceChildren(Hd(e));
      return;
    }
    let a = e.file;
    e.kind === "voice" ? n.replaceChildren(fl(r, a)) : e.kind === "circle" ? n.replaceChildren(gl(r, a)) : Ls(a) ? n.replaceChildren(I("div", { class: "img-wrap" }, I("img", { class: "preview", src: r, alt: a.name, onclick: (i) => {
      i.stopPropagation(), t.onAction("lightbox", e, r);
    } }), t.saveLink(r, a))) : n.replaceChildren(I("div", { class: "file-card" }, I("div", { class: "file-ic" }, ne("clip")), I("div", { class: "fc-main" }, I("div", { class: "fc-name", text: a.name }), I("div", { class: "fc-sub", text: Ha(a.size) })), t.saveLink(r, a)));
  }), n);
}, Ud = (e, t) => {
  let n = Object.entries(e.reactions || {}).filter(([, r]) => r?.length);
  return n.length ? I("div", { class: "reacts" }, ...n.map(([r, a]) => I("button", { class: `react${a.includes(t.myKey) ? " mine" : ""}`, title: t.reactorsText?.(a) || "", onclick: (i) => {
    i.stopPropagation(), t.onAction("react", e, r);
  } }, r, a.length > 1 ? I("b", { text: a.length }) : null))) : null;
}, qd = (e, t, n) => {
  if (e.kind === "system") return I("div", { class: "msg system" }, I("span", { text: e.text }));
  let r = n.authorOf(e), a = !!(t && t.kind !== "system" && n.authorOf(t) === r && e.ts - t.ts < 5 * 6e4 && !e.reply), i = n.profileOf(e), s = I("div", { class: "body" });
  a || s.append(I("div", { class: "head" }, I("span", { class: "who", style: { color: e.mine ? "var(--text)" : i.color }, text: i.name }))), e.reply && s.append(I("button", { class: "quote", onclick: (D) => {
    D.stopPropagation(), n.onAction("jump", e, e.reply.id);
  } }, I("b", { text: e.reply.name }), I("span", { text: e.reply.text }))), e.kind === "text" ? s.append(I("div", { class: "bubble", ondblclick: (D) => {
    D.preventDefault(), n.onAction("react", e, "❤️");
  } }, dl(Xe.enabled() ? Xe.mask(e.text) : e.text, n.openExternal), Zr(e, n))) : e.kind === "voice" ? s.append(I("div", { class: "bubble voice" }, Ms(e, n), Zr(e, n))) : s.append(Ms(e, n), I("div", { class: "meta-under" }, Zr(e, n)));
  let m = n.uploadText?.(e);
  m && s.append(I("div", { class: "upload", text: m }));
  let u = Ud(e, n);
  u && s.append(u);
  let f = I("div", { class: "msg-tools" }, I("button", { title: "Реакция", onclick: (D) => {
    D.stopPropagation(), n.onAction("menu", e, D);
  } }, ne("smile", "sm")), I("button", { title: "Ответить", onclick: (D) => {
    D.stopPropagation(), n.onAction("reply", e);
  } }, ne("reply", "sm")));
  s.append(f);
  let h = I("div", { class: `msg kind-${e.kind}${e.mine ? " mine" : ""}${a ? " cont" : ""}`, dataset: { id: e.id } }, Te(i, "md"), s);
  h.addEventListener("contextmenu", (D) => {
    D.preventDefault(), !(Date.now() - (h._lp || 0) < 800) && n.onAction("menu", e, D);
  });
  let y = null;
  h.addEventListener("touchstart", (D) => {
    let w = D.touches[0];
    y = setTimeout(() => {
      h._lp = Date.now(), navigator.vibrate?.(15), n.onAction("menu", e, { clientX: w.clientX, clientY: w.clientY });
    }, 480);
  }, { passive: true });
  let k = () => clearTimeout(y);
  return h.addEventListener("touchmove", k, { passive: true }), h.addEventListener("touchend", k), h.addEventListener("touchcancel", k), h;
}, Fd = ["text", "file", "voice", "circle"], zd = 100 * 1024 * 1024, yt = (e) => ({ name: ct(e?.name) || "Без имени", color: hr(e?.color) ? e.color : "#7c5cff", avatar: yr(e?.avatar) ? e.avatar : null, bio: ja(e?.bio), ...typeof e?.nick == "string" && /^[a-z0-9_]{3,24}$/.test(e.nick) ? { nick: e.nick } : {}, ...typeof e?.npub == "string" && /^[0-9a-f]{64}$/.test(e.npub) ? { npub: e.npub } : {} }), As = /^[A-Za-z0-9+/]{80,100}=*$/, Ft = async (e, t, n) => {
  let r = Ee(), a = Xr(e.getPeers()[t]), i = a.local && a.remote ? await il(a.local, a.remote) : null;
  return { v: 1, pub: r.pub, dhPub: r.dhPub, sig: i, ...n };
}, Kn = async (e, t, n) => {
  if (!n || typeof n != "object" || typeof n.pub != "string" || !As.test(n.pub) || typeof n.dhPub != "string" || !As.test(n.dhPub)) return null;
  let r = Xr(e.getPeers()[t]);
  return !r.local || !r.remote || !await sl(n.pub, n.sig, r.remote, r.local) ? null : { pub: n.pub, dhPub: n.dhPub, ...yt(n) };
}, Wn = async (e) => `dm:${Oa(await Ka(`pulse-dm:${e}`)).slice(0, 24)}`, _d = ({ settings: e, getProfile: t, events: n, media: r, mail: a }) => {
  let i = pe.get("friends", []), s = pe.get("friend-out", []), m = new Set(pe.get("friend-declined", [])), u = /* @__PURE__ */ new Map(), f = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Map(), k = null, D = false, w = () => pe.set("friends", i), x = () => pe.set("friend-out", s), g = () => n.onChange?.(), T = (o) => Ss(o, e, {}), S = (o, d) => Object.fromEntries(d.map((b) => [b, o.makeAction(b)])), L = async () => {
    let o = Ee(), d = await T(`inbox:${o.friendCode}`), b = S(d, ["hi", "req", "res"]), A = /* @__PURE__ */ new Map();
    d.onPeerJoin = async (B) => b.hi.send(await Ft(d, B, t()), { target: B }).catch(() => {
    }), d.onPeerLeave = (B) => A.delete(B), b.hi.onMessage = (B, { peerId: F }) => A.set(F, Kn(d, F, B)), b.req.onMessage = async (B, { peerId: F }) => {
      let $ = await A.get(F);
      if (!$ || $.pub === o.pub) return;
      await C($, (U) => b.res.send({ accepted: U }, { target: F }).catch(() => {
      }), "direct");
    }, k = { room: d, A: b };
  }, C = async (profile, respond, transport) => {
    const code = await Zt(profile.pub);
    if (m.has(profile.pub)) {
      respond(false);
      return;
    }
    const previous = u.get(profile.pub);
    if (!previous && (i.some(friend => friend.pub === profile.pub) || s.some(request => request.code === code))) {
      await se(profile);
      respond(true);
      return;
    }
    const request = previous ?? { code, replies: new Map() };
    Object.assign(request, profile, { ts: Date.now() });
    request.replies.set(transport, respond);
    if (!previous) {
      u.set(profile.pub, request);
      n.onRequest?.(request);
    }
    g();
  }, replyToRequest = (request, accepted) => {
    for (const respond of request.replies.values()) {
      Promise.resolve().then(() => respond(accepted)).catch(() => {});
    }
  }, G = async (pub) => {
    const request = u.get(pub);
    if (!request || request.accepting) return;
    request.accepting = true;
    try {
      await se(request);
    } finally {
      request.accepting = false;
    }
    u.delete(pub);
    replyToRequest(request, true);
    g();
  }, te = (pub) => {
    const request = u.get(pub);
    if (!request || request.accepting) return;
    u.delete(pub);
    m.add(pub);
    pe.set("friend-declined", [...m]);
    replyToRequest(request, false);
    g();
  }, ae = async (o) => {
    let d = xl(o), b = Ee();
    if (!d) throw new Error("Это не ID аккаунта. Он выглядит как id-…");
    if (d === b.friendCode) throw new Error("Это твой собственный ID 🙂");
    if (i.some((A) => A.code === d)) throw new Error("Уже в друзьях");
    s.some((A) => A.code === d) || (s.push({ code: d, ts: Date.now() }), x());
    for (let A of u.values()) if (A.code === d) return G(A.pub);
    ie(d), g();
  }, Y = (o) => {
    s = s.filter((d) => d.code !== o), x(), fe(o), g();
  }, ie = async (o) => {
    if (h.has(o)) return;
    h.set(o, null);
    let d = await T(`inbox:${o}`);
    if (!h.has(o)) {
      d.leave();
      return;
    }
    let b = S(d, ["hi", "req", "res"]), A = null;
    d.onPeerJoin = async (B) => b.hi.send(await Ft(d, B, t()), { target: B }).catch(() => {
    }), b.hi.onMessage = async (B, { peerId: F }) => {
      let $ = await Kn(d, F, B);
      if (!$ || await Zt($.pub) !== o) return;
      A = { peerId: F, profile: $ };
      let U = s.find((ee) => ee.code === o);
      U && U.name !== $.name && (U.name = $.name, x(), g()), b.req.send({}, { target: F }).catch(() => {
      });
    }, b.res.onMessage = async (B, { peerId: F }) => {
      !A || A.peerId !== F || (s = s.filter(($) => $.code !== o), x(), fe(o), B?.accepted ? (await se(A.profile), n.onAccepted?.(A.profile)) : n.onDeclined?.(A.profile), g());
    }, h.set(o, { room: d, A: b });
  }, fe = (o) => {
    let d = h.get(o);
    h.delete(o), d?.room.leave();
  }, mergePeerInfo = (friend, peer) => {
    const info = yt(peer);
    if (friend.npub && info.npub !== friend.npub) delete info.npub;
    Object.assign(friend, info);
  }, se = async (o) => {
    let d = i.find((b) => b.pub === o.pub);
    return d ? mergePeerInfo(d, o) : (d = { pub: o.pub, dhPub: o.dhPub, code: await Zt(o.pub), ...yt(o), added: Date.now(), lastSeen: 0 }, i.push(d), m.delete(o.pub)), w(), s = s.filter((b) => b.code !== d.code), x(), fe(d.code), p(d), g(), d;
  }, z = async (o) => {
    if (!i.find((b) => b.pub === o)) return;
    let d = f.get(o);
    d?.peerId && await d.A.bye.send(1, { target: d.peerId }).catch(() => {
    }), d?.room?.leave(), f.delete(o), presence.delete(o), i = i.filter((b) => b.pub !== o), w();
    for (let b of await O(o)) b.kind !== "text" && r.del(b.id);
    pe.remove(await Wn(o)), y.delete(o), g();
  }, p = async (o) => {
    if (f.has(o.pub)) return;
    let d = { room: null, A: null, peerId: null };
    f.set(o.pub, d);
    let b = "dm-" + await nl(o.dhPub, "dm"), A = await T(b);
    if (f.get(o.pub) !== d) {
      A.leave();
      return;
    }
    let B = S(A, ["hi", "msg", "ack", "blob", "react", "del", "ring", "ringx", "ringa", "invite", "typing", "bye"]);
    d.room = A, d.A = B;
    let F = ($) => $ === d.peerId;
    A.onPeerJoin = async ($) => B.hi.send(await Ft(A, $, t()), { target: $ }).catch(() => {
    }), A.onPeerLeave = ($) => {
      F($) && (d.peerId = null, o.lastSeen = Date.now(), w(), n.onPresence?.(o, false), g());
    }, B.hi.onMessage = async ($, { peerId: U }) => {
      let ee = await Kn(A, U, $);
      if (!ee || ee.pub !== o.pub) return;
      let de = !!d.peerId;
      d.peerId = U, mergePeerInfo(o, ee), o.lastSeen = Date.now(), w(), de || (n.onPresence?.(o, true), Me(o)), g();
    }, B.msg.onMessage = async ($, { peerId: U }) => {
      if (!F(U)) return;
      let ee = await Q(o, $);
      ee && (ee.kind === "text" || await r.get(ee.id)) && B.ack.send({ ids: [ee.id] }, { target: U }).catch(() => {
      });
    }, B.blob.onReceive = ({ byteLength: $ }) => $ <= zd, B.blob.onReceiveProgress = async ($, { peerId: U, metadata: ee }) => {
      if (!F(U) || typeof ee?.id != "string") return;
      let de = (await O(o.pub)).find((Le) => Le.id === ee.id && !Le.mine);
      de && de.progress != null && (de.progress = Math.min($, 0.99), n.onProgress?.(o, de));
    }, B.blob.onMessage = async ($, { peerId: U, metadata: ee }) => {
      if (!F(U) || typeof ee?.id != "string") return;
      let de = (await O(o.pub)).find((Le) => Le.id === ee.id && !Le.mine);
      !de || !de.file || (await r.put(de.id, new Blob([$], { type: de.file.type }), e.saveHistory), delete de.progress, M(o.pub), B.ack.send({ ids: [de.id] }, { target: U }).catch(() => {
      }), n.onUpdate?.(o, de));
    }, B.react.onMessage = async ($, { peerId: U }) => {
      if (!F(U) || typeof $?.id != "string" || !qt.includes($.emoji)) return;
      let ee = (await O(o.pub)).find((de) => de.id === $.id);
      ee && (q(ee, $.emoji, "them", !!$.on), M(o.pub), n.onUpdate?.(o, ee));
    }, B.del.onMessage = async ($, { peerId: U }) => {
      if (!F(U) || typeof $?.id != "string") return;
      ue($.id);
      let ee = await O(o.pub), de = ee.findIndex((Le) => Le.id === $.id && !Le.mine);
      de < 0 || (ee.splice(de, 1), r.del($.id), M(o.pub), n.onUpdate?.(o, null));
    }, B.ack.onMessage = ($, { peerId: U }) => F(U) && be(o.pub, $?.ids), B.typing.onMessage = ($, { peerId: U }) => {
      F(U) && (o.typingUntil = Date.now() + 3500, n.onTyping?.(o));
    }, B.ring.onMessage = ($, { peerId: U }) => {
      !F(U) || typeof $?.callId != "string" || !/^[1-9A-HJ-NP-Za-km-z]{16,40}$/.test($.callId) || n.onRing?.(o, { callId: $.callId, video: !!$.video });
    }, B.ringx.onMessage = ($, { peerId: U }) => F(U) && n.onRingCancel?.(o, $?.callId), B.ringa.onMessage = ($, { peerId: U }) => F(U) && n.onRingAnswer?.(o, $?.callId, !!$?.accept), B.invite.onMessage = ($, { peerId: U }) => {
      !F(U) || typeof $?.code != "string" || n.onInvite?.(o, { code: $.code, name: ct($.name) || "комната" });
    }, B.bye.onMessage = async ($, { peerId: U }) => {
      F(U) && (n.onRemoved?.(o), await z(o.pub));
    };
  }, presence = new Map(), R = (o) => !!f.get(o)?.peerId, getPresence = pub => {
    if (R(pub)) return "online";
    const record = presence.get(pub);
    if (!record || networkNow() >= record.expires) return "unknown";
    return record.online ? "online" : "offline";
  }, j = pub => getPresence(pub) === "online", _ = (o, d, b) => {
    let A = f.get(o);
    return A?.peerId ? (A.A[d].send(b, { target: A.peerId }).catch(() => {
    }), true) : false;
  }, sendRoomInvite = async (pub, code, name) => {
    const friend = i.find(candidate => candidate.pub === pub);
    if (!friend) return false;
    const invite = { code, name };
    const direct = f.get(pub);
    const peerId = direct?.peerId;
    if (peerId) {
      let sent = false;
      try {
        await direct.A.invite.send(invite, { target: peerId, onProgress: progress => { sent = progress === 1; } });
      } catch {
      }
      if (sent) return true;
    }
    try {
      return await a?.invite?.(friend, invite) === true;
    } catch {
      return false;
    }
  }, O = async (o) => {
    if (!y.has(o)) {
      let d = e.saveHistory ? pe.get(await Wn(o), []) : [];
      y.set(o, Array.isArray(d) ? d : []);
    }
    return y.get(o);
  }, P = /* @__PURE__ */ new Map(), M = (o) => {
    clearTimeout(P.get(o)), P.set(o, setTimeout(async () => {
      let d = y.get(o) || [], b = e.saveHistory ? d.slice(-1e3) : d.filter((A) => A.mine && A.status !== "delivered");
      pe.set(await Wn(o), b);
    }, 400));
  }, q = (o, d, b, A) => {
    o.reactions ||= {};
    let B = o.reactions[d] ||= [], F = B.includes(b);
    A && !F && B.push(b), !A && F && B.splice(B.indexOf(b), 1), B.length || delete o.reactions[d];
  }, J = new Set(pe.get("deleted-ids", [])), ue = (o) => {
    if (typeof o != "string" || J.has(o)) return;
    J.add(o);
    let d = [...J];
    d.length > 3e3 && (d = d.slice(-3e3), J = new Set(d)), pe.set("deleted-ids", d);
  }, Q = async (o, d, { mine: b = false } = {}) => {
    if (!d || typeof d != "object" || typeof d.id != "string" || !/^[0-9a-f]{8,40}$/.test(d.id) || J.has(d.id)) return null;
    let A = Fd.includes(d.kind) ? d.kind : "text", B = typeof d.text == "string" ? d.text.slice(0, 4e3) : "", F = A === "text" ? null : Es(d.file, A);
    if (A === "text" ? !B.trim() : !F) return null;
    let $ = await O(o.pub), U = $.find((ee) => ee.id === d.id);
    return U || (U = { id: d.id, ts: typeof d.ts == "number" && isFinite(d.ts) ? Math.min(d.ts, Gn() + 5e3) : Gn(), kind: A, text: B, mine: b, reply: Ds(d.reply), reactions: {} }, b && (U.status = "sent"), F && (U.file = F, b || (U.progress = 0)), $.push(U), $.sort((ee, de) => ee.ts - de.ts), M(o.pub), b ? n.onUpdate?.(o, U) : (o.typingUntil = 0, n.onMessage?.(o, U))), U;
  }, be = async (o, d) => {
    if (!Array.isArray(d)) return;
    let b = await O(o), A = false;
    for (let B of b) B.mine && d.includes(B.id) && B.status !== "delivered" && (B.status = "delivered", A = true);
    A && (M(o), n.onDelivery?.(i.find((B) => B.pub === o)));
  }, we = (o) => ({ id: o.id, ts: o.ts, kind: o.kind, text: o.text, file: o.file || null, reply: o.reply || null }), Pe = /* @__PURE__ */ new Set(), Ce = async (o, d) => {
    let b = f.get(o);
    if (!b?.peerId || Pe.has(d.id)) return;
    let A = b.peerId, B = d.kind === "text" ? null : await r.get(d.id);
    if (!(d.kind !== "text" && !B)) {
      if (b.A.msg.send(we(d), { target: A }).catch(() => {
      }), B) {
        Pe.add(d.id);
        try {
          await b.A.blob.send(await B.arrayBuffer(), { target: A, metadata: { id: d.id }, onProgress: (F) => {
            d.upload = F, n.onProgress?.(i.find(($) => $.pub === o), d);
          } });
        } catch {
        } finally {
          Pe.delete(d.id), delete d.upload;
        }
      }
      d.status === "pending" && (d.status = "sent"), M(o), n.onDelivery?.(i.find((F) => F.pub === o));
    }
  }, qe = async (o, d, b = null) => {
    let A = await O(o), B = { id: gr(), ts: Gn(), kind: d.kind || "text", text: d.text || "", reply: d.reply || null, mine: true, status: "pending", reactions: {} };
    d.file && (B.file = d.file), b && await r.put(B.id, b, true), A.push(B), M(o), Ce(o, B);
    let F = i.find(($) => $.pub === o);
    return B.kind === "text" && F && a?.send(F, we(B)), B;
  }, Me = async (o) => {
    let d = await O(o.pub);
    for (let b of d) b.mine && b.status !== "delivered" && Ce(o.pub, b);
    n.onDelivery?.(o);
  };
  return { start: async () => {
    D || (D = true, await L(), i.forEach(p), s.forEach((o) => ie(o.code)));
  }, receive: (o, d, b) => {
    let A = i.find((B) => B.pub === o);
    return A ? Q(A, d, b) : null;
  }, delivered: be, requestFrom: (o, d) => {
    if (!i.some(friend => friend.pub === o.pub)) return C({ pub: o.pub, dhPub: o.dhPub, ...yt(o) }, d, "mail");
  }, answerFrom: async (o, d) => {
    s.some((b) => b.code === o.code) && (d ? (await se({ pub: o.pub, dhPub: o.dhPub, ...yt(o) }), n.onAccepted?.(o)) : (s = s.filter((b) => b.code !== o.code), x(), fe(o.code), n.onDeclined?.(o), g()));
  }, markSent: async (o, d) => {
    let b = (await O(o)).find((A) => A.id === d);
    b && b.mine && b.status === "pending" && (b.status = "sent", M(o), n.onDelivery?.(i.find((A) => A.pub === o)));
  }, setFriendInfo: (o, d) => {
    let b = i.find((A) => A.pub === o);
    if (!b) return;
    if (d.npub && d.npub !== b.npub) presence.delete(o);
    Object.assign(b, d);
    w();
    g();
  }, snapshot: () => ({ friends: i.map(({ pub: o, dhPub: d, code: b, name: A, color: B, bio: F, nick: $, npub: U, npubAt, added: ee }) => ({ pub: o, dhPub: d, code: b, name: A, color: B, bio: F, nick: $, npub: U, npubAt, added: ee })), out: s.map(({ code: o, name: d, ts: b }) => ({ code: o, name: d, ts: b })), declined: [...m] }), merge: (o) => {
    let d = false;
    for (let b of o?.friends || []) if (typeof b?.pub == "string" && typeof b.dhPub == "string" && !i.some((A) => A.pub === b.pub) && !m.has(b.pub)) {
      let A = { pub: b.pub, dhPub: b.dhPub, code: b.code, ...yt(b), added: b.added || Date.now(), lastSeen: 0 };
      if (A.npub && Number.isSafeInteger(b.npubAt)) A.npubAt = b.npubAt;
      i.push(A), D && p(A), d = true;
    }
    for (let b of o?.out || []) typeof b?.code == "string" && !s.some((A) => A.code === b.code) && !i.some((A) => A.code === b.code) && (s.push({ code: b.code, name: b.name, ts: b.ts || Date.now() }), D && ie(b.code), d = true);
    for (let b of o?.declined || []) typeof b == "string" && !m.has(b) && (m.add(b), d = true);
    return d && (w(), x(), pe.set("friend-declined", [...m]), g()), d;
  }, list: () => [...i].sort((o, d) => Number(j(d.pub)) - Number(j(o.pub)) || o.name.localeCompare(d.name)), get: (o) => i.find((d) => d.pub === o), isFriend: (o) => i.some((d) => d.pub === o), isOnline: j, isDirect: R, getPresence, setPresence: (pub, at, online = true, id = "") => {
    const friend = i.find(item => item.pub === pub);
    const now = networkNow();
    const lifetime = 120_000;
    if (!friend || !Number.isSafeInteger(at) || at > now + lifetime || at + lifetime <= now) return;
    const previous = presence.get(pub);
    if (previous && (at < previous.at || (at === previous.at && id >= previous.id))) return;
    const seen = Math.min(at, now);
    presence.set(pub, { at, id, online, expires: seen + lifetime });
    if (online && seen > (friend.lastSeen || 0)) {
      friend.lastSeen = seen;
      w();
    }
    g();
  }, incoming: () => [...u.values()], outgoing: () => [...s], addByCode: ae, cancelOutgoing: Y, acceptRequest: G, declineRequest: te, removeFriend: z, getHistory: O, sendMessage: qe, react: async (o, d, b) => {
    let A = (await O(o)).find((F) => F.id === d);
    if (!A || !qt.includes(b)) return;
    let B = !(A.reactions?.[b] || []).includes("me");
    q(A, b, "me", B), M(o), _(o, "react", { id: d, emoji: b, on: B });
  }, deleteMessage: async (o, d) => {
    let b = await O(o), A = b.findIndex(($) => $.id === d);
    if (A < 0) return;
    let [B] = b.splice(A, 1);
    ue(d), B.mine && _(o, "del", { id: d }), r.del(d), M(o);
    let F = i.find(($) => $.pub === o);
    F && a?.del(F, d, !!B.mine);
  }, removeByMail: async (o, d, b) => {
    ue(d);
    let A = await O(o), B = A.findIndex((F) => F.id === d && (b || !F.mine));
    B < 0 || (A.splice(B, 1), r.del(d), M(o), n.onUpdate?.(i.find((F) => F.pub === o), null));
  }, clearHistory: async (o) => {
    for (let d of await O(o)) ue(d.id), d.kind !== "text" && r.del(d.id);
    y.set(o, []), pe.remove(await Wn(o));
  }, mediaIds: async () => {
    let o = [];
    for (let d of i) for (let b of await O(d.pub)) b.kind !== "text" && o.push(b.id);
    return o;
  }, typing: (o) => _(o, "typing", 1), ring: (o, d, b) => _(o, "ring", { callId: d, video: b }), cancelRing: (o, d) => _(o, "ringx", { callId: d }), answerRing: (o, d, b) => _(o, "ringa", { callId: d, accept: b }), invite: sendRoomInvite, canInvite: (pub) => R(pub) || !!a?.invite && i.some(friend => friend.pub === pub && friend.npub && friend.dhPub), connection: (o) => {
    let d = f.get(o);
    return d?.peerId ? d.room.getPeers()[d.peerId] : null;
  }, broadcastProfile: async () => {
    for (let o of f.values()) o.peerId && o.A.hi.send(await Ft(o.room, o.peerId, t()), { target: o.peerId }).catch(() => {
    });
    if (k) for (let o of Object.keys(k.room.getPeers())) k.A.hi.send(await Ft(k.room, o, t()), { target: o }).catch(() => {
    });
  } };
}, Gn = networkNow, ve = window.PulseAndroid || null, Nd = (e) => {
  let t = "";
  for (let n = 0; n < e.length; n += 32768) t += String.fromCharCode(...e.subarray(n, n + 32768));
  return btoa(t);
}, $s = async (e, t, n) => {
  try {
    let r = await (await fetch(e)).blob(), a = ve.beginSave(t, n);
    if (!a) throw new Error("нет доступа к памяти");
    let i = 768 * 1024;
    for (let s = 0; s < r.size; s += i) {
      let m = new Uint8Array(await r.slice(s, s + i).arrayBuffer());
      if (!ve.appendSave(a, Nd(m))) throw new Error("ошибка записи");
    }
    ve.endSave(a), H(`Сохранено: Загрузки/Pulse/${t}`, "ok");
  } catch (r) {
    H("Не удалось сохранить файл: " + r.message, "bad");
  }
}, Vd = ve && { getScreenSources: null, selectScreenSource: async () => {
}, openExternal: async (e) => ve.openExternal(String(e)), notify: async (e, t, n) => ve.notify(String(e), String(t), String(n?.pub || ""), String(n?.kind || "")), focus: async () => ve.focus(), info: async () => ({ version: ve.version(), platform: "android" }), setBadge: () => {
}, clockOffset: async () => ve.clockOffset?.() || 0, onOpenChat: (e) => {
  window.__pulseOpenChat = e;
  let t = ve.takeOpenChat?.();
  t && setTimeout(() => e(t), 300);
}, setHotkeys: async () => {
}, setSystem: async () => {
}, setInCall: (e) => ve.setInCall(!!e), onHotkeyMute: () => {
}, onHotkeyDeafen: () => {
} }, he = window.pulse || Vd || { getScreenSources: null, selectScreenSource: async () => {
}, openExternal: async (e) => window.open(e, "_blank", "noopener"), notify: async () => {
}, focus: async () => {
}, info: async () => ({ version: "dev", platform: "web" }), setHotkeys: async () => {
}, setSystem: async () => {
}, onHotkeyMute: () => {
}, onHotkeyDeafen: () => {
} }, zt = () => matchMedia("(max-width: 760px)").matches, Qr = (e) => document.body.classList.toggle("m-detail", e);
ve && document.body.classList.add("is-android"), !navigator.mediaDevices?.getDisplayMedia && !window.pulse && !ve?.startScreenShare && document.body.classList.add("no-screen-share");
var Jn = ["#7c5cff", "#00b8ff", "#ff4d8d", "#ff8a3d", "#2ee59d", "#c86bfa", "#ffcc33", "#3dd6d0"], Kd = { account: false, name: "", bio: "", avatar: null, color: Jn[Math.floor(Math.random() * Jn.length)], theme: "neon", animations: true, bgIntensity: 1, reactive: true, wallpaper: false, wallDim: 35, wallBlur: 0, micId: "", outId: "", camId: "", micGain: 1, master: 1, mode: "open", vad: 8, pttKey: "KeyV", ns: true, ec: true, agc: false, joinMuted: false, sounds: true, camQ: "720", mirror: true, lowLatency: true, audioBitrate: 64e3, turnUrl: "", turnUser: "", turnPass: "", relays: savedRelayPreference(), stun: [], saveHistory: true, hkMute: "CommandOrControl+Shift+M", hkDeaf: "CommandOrControl+Shift+D", tray: true, autostart: false, chatOpen: true, autoLock: 0, volumes: {} }, v = { ...Kd, ...pe.get("settings", {}) }, ce = () => pe.set("settings", v), tt = pe.get("contacts", {}), ea = () => pe.set("contacts", tt), nt = pe.get("rooms", []), rt = () => pe.set("rooms", nt), at = () => ({ name: v.name, color: v.color, avatar: v.avatar, bio: v.bio, nick: confirmedNick() || void 0, npub: v.npub || void 0 }), ta = "web", vn = () => {
  ml(v.theme, { animations: v.animations, intensity: v.bgIntensity }), document.body.classList.toggle("no-reactive", !v.reactive);
};
vn(), document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("page-hidden", document.hidden));
var _t = async () => {
  let e = document.getElementById("wallpaper"), t = v.wallpaper ? await _e.url("__wallpaper") : null;
  e.classList.toggle("hidden", !t), document.body.classList.toggle("has-wall", !!t), t && (e.style.backgroundImage = `url("${t}")`), e.style.setProperty("--dim", String((v.wallDim || 0) / 100)), e.style.setProperty("--blur", `${v.wallBlur || 0}px`);
  let n = document.getElementById("s-wall-preview");
  n.style.backgroundImage = t ? `url("${t}")` : "", n.classList.toggle("has-img", !!t), document.getElementById("s-wall-dim-wrap").classList.toggle("hidden", !t), document.getElementById("s-wall-blur-wrap").classList.toggle("hidden", !t);
};
_t();
var K = new $d();
K.setMasterVolume(v.master), K.setMicGain(v.micGain), v.outId && K.setOutputDevice(v.outId);
var l = null, Nt = false, V = { type: "welcome" }, bn = /* @__PURE__ */ new Map(), na = /* @__PURE__ */ new Map(), W = null, it = c("tooltip");
document.addEventListener("mouseover", (e) => {
  let t = e.target.closest?.("[data-tip]");
  if (!t || matchMedia("(hover: none)").matches) return;
  it.textContent = t.dataset.tip, it.classList.remove("hidden");
  let n = t.getBoundingClientRect(), r = it.getBoundingClientRect();
  t.closest("#rail") ? (it.style.left = `${n.right + 12}px`, it.style.top = `${n.top + n.height / 2 - r.height / 2}px`) : (it.style.left = `${Math.max(8, n.left + n.width / 2 - r.width / 2)}px`, it.style.top = `${n.top - r.height - 10}px`);
}), document.addEventListener("mouseout", (e) => {
  e.target.closest?.("[data-tip]") && it.classList.add("hidden");
}), document.addEventListener("mousedown", () => it.classList.add("hidden"));
var Yn = (e) => e.style.setProperty("--p", `${(e.value - e.min) / (e.max - e.min) * 100}%`);
document.addEventListener("input", (e) => {
  e.target.type === "range" && Yn(e.target);
});
var ra = () => document.querySelectorAll("input[type=range]").forEach(Yn);
document.addEventListener("mousemove", (e) => {
  let t = e.target.closest?.(".tilt");
  if (document.querySelectorAll(".tilt.tilting").forEach((i) => {
    i !== t && (i.classList.remove("tilting"), i.style.transform = "");
  }), !t || !v.animations) return;
  let n = t.getBoundingClientRect(), r = (e.clientX - n.left) / n.width - 0.5, a = (e.clientY - n.top) / n.height - 0.5;
  t.classList.add("tilting"), t.style.transform = `rotateY(${r * 8}deg) rotateX(${-a * 8}deg) translateY(-4px)`;
});
let roomDialogCheck = null;
var At = (e) => {
  c("modal-backdrop").classList.remove("hidden"), c(e).classList.remove("hidden"), ra();
}, je = (e) => {
  if (e === "room-modal") roomDialogCheck?.abort();
  c(e).classList.add("hidden"), [...document.querySelectorAll(".modal")].some((t) => !t.classList.contains("hidden")) || c("modal-backdrop").classList.add("hidden"), e === "settings-modal" && Ru();
}, Xn = null, Wd = (e, t = "", n = "Сохранить") => new Promise((r) => {
  Xn?.(null), Xn = r, c("prompt-title").textContent = e, c("prompt-ok").textContent = n, c("prompt-input").value = t, At("prompt-modal"), setTimeout(() => c("prompt-input").select(), 30);
}), Vt = (e) => {
  let t = Xn;
  Xn = null, je("prompt-modal"), t?.(e);
};
c("prompt-ok").addEventListener("click", () => Vt(c("prompt-input").value)), c("prompt-input").addEventListener("keydown", (e) => e.key === "Enter" && Vt(c("prompt-input").value)), document.querySelectorAll(".modal [data-close]").forEach((e) => e.addEventListener("click", () => {
  let t = e.closest(".modal").id;
  t === "prompt-modal" ? Vt(null) : je(t);
})), c("modal-backdrop").addEventListener("click", () => document.querySelectorAll(".modal:not(.hidden)").forEach((e) => e.id === "prompt-modal" ? Vt(null) : je(e.id)));
var Re = c("ctx-menu"), Zn = (e, t, n) => {
  Re.replaceChildren(...n.map((a) => a === "-" ? I("hr") : I("button", { class: a.danger ? "danger" : "", onclick: () => {
    vt(), a.fn();
  } }, a.icon ? ne(a.icon, "sm") : null, a.label))), Re.classList.remove("hidden");
  let r = Re.getBoundingClientRect();
  Re.style.left = `${Math.max(8, Math.min(e, innerWidth - r.width - 8))}px`, Re.style.top = `${Math.min(t, innerHeight - r.height - 8)}px`;
}, vt = () => Re.classList.add("hidden");
document.addEventListener("mousedown", (e) => {
  Re.contains(e.target) || vt();
});
var Cs = (e, t, n = 15e3) => {
  let r = I("div", { class: "toast", style: { "pointer-events": "auto", "flex-direction": "column" } }, I("div", { style: { display: "flex", gap: "10px" } }, ne("info", "sm"), I("span", { text: e })), I("div", { class: "btn-row" }, ...t.map((a) => I("button", { class: `btn sm ${a.primary ? "primary" : "glass"}`, text: a.label, onclick: () => {
    r.remove(), a.fn?.();
  } }))));
  c("toasts").append(r), setTimeout(() => r.remove(), n);
}, Kt = (e, t = "Да") => new Promise((n) => {
  Cs(e, [{ label: t, primary: true, fn: () => n(true) }, { label: "Отмена", fn: () => n(false) }], 2e4);
});
document.addEventListener("keydown", (e) => {
  e.key === "Escape" && (ye && ca(), or(), vt(), document.querySelector(".lightbox")?.remove(), document.querySelectorAll(".modal:not(.hidden)").forEach((t) => t.id === "prompt-modal" ? Vt(null) : je(t.id)));
});
var Gd = (e) => {
  e.replaceChildren(...Object.entries(ul).map(([t, n]) => I("button", { class: `theme-dot${v.theme === t ? " active" : ""}`, title: n.name, dataset: { theme: t }, style: { background: `linear-gradient(135deg, ${n.a1}, ${n.a2})` }, onclick: () => {
    v.theme = t, ce(), vn(), Ua(Ye().id, { theme: t }), e.querySelectorAll(".theme-dot").forEach((r) => r.classList.toggle("active", r.dataset.theme === t));
  } })));
}, bt = () => {
  c("ub-avatar").replaceChildren(Te(at(), "md")), c("ub-name").textContent = v.name, c("ub-status").textContent = l ? `В звонке · ${l.record.name}` : v.bio || "В сети";
  let e = l ? !l.sendTrack || l.micMuted || l.deafened : v.joinMuted, t = c("ub-mic");
  t.classList.toggle("off", e), Xt(t, e ? "mic-off" : "mic");
  let n = c("ub-deaf");
  n.classList.toggle("off", !!l?.deafened), Xt(n, l?.deafened ? "head-off" : "head"), c("w-name").textContent = v.name;
  renderFriendSharing();
};
bindFriendSharing();
c("ub-me").addEventListener("click", () => ur("account")), c("ub-settings").addEventListener("click", () => ur()), c("rail-settings").addEventListener("click", () => ur()), c("ub-mic").addEventListener("click", () => {
  l ? va() : (v.joinMuted = !v.joinMuted, ce(), bt(), H(v.joinMuted ? "Будешь заходить с выключенным микрофоном" : "Микрофон будет включён при входе"));
}), c("ub-deaf").addEventListener("click", () => l && rr());
var Bs = (e) => ({ name: e.name, color: e.color || "#7c5cff", avatar: e.icon }), He = () => {
  c("rail-rooms").replaceChildren(...[...nt].sort((t, n) => (t.created ?? 0) - (n.created ?? 0)).map((t) => I("button", { class: `rail-btn${V.type === "room" && l?.code === t.code ? " active" : ""}${l?.code === t.code ? " live" : ""}`, "data-tip": t.name, onclick: () => Sn(t.code), oncontextmenu: (n) => {
    n.preventDefault(), Zn(n.clientX, n.clientY, [{ label: "Скопировать приглашение", icon: "copy", fn: () => dt(fa(t), "Приглашение скопировано") }, { label: "Переименовать", icon: "pencil", fn: () => so(t) }, { label: "Сменить иконку", icon: "image", fn: () => oo(t) }, { label: t.pub ? "Убрать из поиска" : "Сделать публичной (видна в поиске)", icon: "globe", fn: () => {
      t.pub = !t.pub, t.pub || (t.wasPub = true), t.metaTs = Date.now(), rt(), H(t.pub ? `«${t.name}» теперь находят по названию` : `«${t.name}» больше не видна в поиске`, "ok");
    } }, "-", { label: "Убрать из списка", icon: "trash", danger: true, fn: () => nu(t) }]);
  } }, Te(Bs(t), "lg")))), c("rail-home").classList.toggle("active", V.type !== "room");
  let e = [...bn.values()].reduce((t, n) => t + n, 0) + (W?.incoming().length || 0);
  c("home-badge").textContent = e > 99 ? "99+" : e, c("home-badge").classList.toggle("hidden", !e), he.setBadge?.(e);
};
c("rail-home").addEventListener("click", () => wt(V.type === "dm" ? V.pub : aa)), c("rail-add").addEventListener("click", () => uo()), c("w-room").addEventListener("click", () => uo());
var Wt = () => {
  let e = V.type === "room";
  c("panel-home").classList.toggle("hidden", e), c("panel-room").classList.toggle("hidden", !e), c("callbar").classList.toggle("hidden", !l || e && !zt()), l && !e && (c("cb-title").textContent = l.record.name), e ? Ae() : wn();
}, aa = null, Os = describeFriendStatus, js = (e, t, n) => I("div", { class: "av-wrap" }, Te(e, t), n == null ? null : I("span", { class: `status-dot${n ? " on" : ""}` })), Hs = (e, t, n) => Zn(t, n, [{ label: "Написать", icon: "chat", fn: () => wt(e.pub) }, { label: "Позвонить", icon: "phone", fn: () => kn(e.pub, false) }, { label: "Видеозвонок", icon: "cam", fn: () => kn(e.pub, true) }, ...l ? [{ label: `Позвать в «${l.record.name}»`, icon: "user-plus", fn: () => pa(e.pub) }] : [], { label: "Код безопасности", icon: "shield", fn: () => vu(e.pub) }, { label: "Скопировать ID", icon: "copy", fn: () => dt(e.code, "ID скопирован") }, "-", { label: "Очистить переписку", icon: "trash", fn: async () => {
  await Kt(`Удалить переписку с ${e.name} на этом устройстве?`, "Удалить") && (await W.clearHistory(e.pub), V.type === "dm" && V.pub === e.pub && $e());
} }, { label: "Удалить из друзей", icon: "x", danger: true, fn: async () => {
  await Kt(`Удалить ${e.name} из друзей?`, "Удалить") && (await W.removeFriend(e.pub), V.type === "dm" && V.pub === e.pub && wt(null));
} }]), wn = () => {
  if (!W) return;
  const friendQuery = c("friend-search").value;
  c("req-box").replaceChildren(...W.incoming().map((a) => I("div", { class: "req" }, Te(a, "md"), I("div", { class: "f-main" }, I("div", { class: "f-name", text: a.name }), I("div", { class: "f-sub", text: "хочет добавить тебя" })), I("button", { class: "icon-btn accent", title: "Принять", onclick: () => W.acceptRequest(a.pub) }, ne("check", "sm")), I("button", { class: "icon-btn danger", title: "Отклонить", onclick: () => W.declineRequest(a.pub) }, ne("x", "sm")))), ...W.outgoing().map((a) => I("div", { class: "req out" }, I("div", { class: "avatar md", style: { "--c": "#4a4f66" } }, ne("clock", "sm")), I("div", { class: "f-main" }, I("div", { class: "f-name", text: a.name || a.code }), I("div", { class: "f-sub", text: a.name ? "заявка отправлена" : "ждём, когда появится в сети" })), I("button", { class: "icon-btn", title: "Отменить", onclick: () => W.cancelOutgoing(a.code) }, ne("x", "sm")))));
  let t = W.list(), n = t.filter((a) => W.isOnline(a.pub)).length;
  c("online-count").textContent = `${n} в сети`;
  let r = c("friend-list");
  if (!t.length) {
    r.replaceChildren(I("div", { class: "empty-hint" }, ne("user-plus"), "Пока никого. Нажми ", I("b", { text: "+" }), " сверху и вставь ID друга — или отправь ему свой."));
    return;
  }
  r.replaceChildren(...t.filter(friend => Qt.matchesFriendSearch(friend, friendQuery)).map((a, i) => {
    let s = W.isOnline(a.pub), m = bn.get(a.pub) || 0;
    return I("div", { class: `f-item${s ? "" : " offline"}${V.type === "dm" && V.pub === a.pub ? " active" : ""}`, style: { "animation-delay": `${Math.min(i, 12) * 25}ms` }, onclick: () => wt(a.pub), oncontextmenu: (u) => {
      u.preventDefault(), Hs(a, u.clientX, u.clientY);
    } }, js(a, "md", s), I("div", { class: "f-main" }, I("div", { class: "f-name", text: a.name }), I("div", { class: `f-sub${a.typingUntil > Date.now() ? " typing-sub" : ""}`, text: Os(a) })), m ? I("span", { class: "f-badge", text: m }) : null, I("div", { class: "f-actions" }, I("button", { class: "icon-btn", title: s ? "Позвонить" : Os(a), disabled: !s, onclick: (u) => {
      u.stopPropagation(), kn(a.pub, false);
    } }, ne("phone", "sm"))));
  }));
};
c("friend-search").addEventListener("input", wn), c("pf-add").addEventListener("click", () => {
  c("af-code").value = "", At("addfriend-modal"), setTimeout(() => c("af-code").focus(), 50);
});
var ia = async (e) => {
  try {
    const { delivered } = await Qt.addFriend(e.value);
    e.value = "";
    if (delivered) H("Заявка отправлена", "ok");
    else H("Заявка сохранена. Pulse отправит её, когда появится связь с другом.");
    return true;
  } catch (t) {
    return H(t.message, "bad"), false;
  }
};
c("af-btn").addEventListener("click", async () => await ia(c("af-code")) && je("addfriend-modal")), c("af-code").addEventListener("keydown", (e) => e.key === "Enter" && c("af-btn").click()), c("w-add-btn").addEventListener("click", () => ia(c("w-add"))), c("w-add").addEventListener("keydown", (e) => e.key === "Enter" && ia(c("w-add")));
var sa = (e) => {
  for (let t of ["welcome", "dm", "room"]) c(`view-${t}`).classList.toggle("hidden", t !== e);
}, wt = (e) => {
  e && !W.get(e) && (e = null), V = e ? { type: "dm", pub: e } : { type: "welcome" }, e && (aa = e, bn.delete(e)), sa(e ? "dm" : "welcome"), Qr(!!e), e && $e(true), Wt(), He();
}, oa = () => {
  if (!l) return;
  V = { type: "room", code: l.code }, sa("room"), Qr(true);
  let e = v.chatOpen && !zt();
  c("view-room").classList.toggle("chat-closed", !e), e && Da(false), Wt(), He();
};
c("cb-open").addEventListener("click", oa);
var la = () => {
  Qr(false), V.type === "dm" && (V = { type: "welcome" }, sa("welcome")), Wt(), He();
};
window.__pulseBack = () => {
  let e = document.querySelector(".lightbox");
  if (e) return e.remove(), true;
  if (!Re.classList.contains("hidden")) return vt(), true;
  if (!c("vol-pop").classList.contains("hidden")) return or(), true;
  let t = [...document.querySelectorAll(".modal:not(.hidden)")];
  return t.length ? (t.forEach((n) => n.id === "prompt-modal" ? Vt(null) : je(n.id)), true) : ye ? (ca(), true) : ro.cancelRecording() || cr.cancelRecording() || ge ? true : V.type === "room" && zt() && !c("view-room").classList.contains("chat-closed") ? (Ma(false), true) : zt() && document.body.classList.contains("m-detail") ? (la(), true) : false;
}, c("dm-back").addEventListener("click", la), c("room-back").addEventListener("click", la), c("cb-hangup").addEventListener("click", () => kt());
var Us = (e) => {
  e.style.height = "auto", e.style.height = Math.min(e.scrollHeight, 160) + "px";
}, qs = (e) => {
  let t = I("div", { class: "lightbox", onclick: () => t.remove() }, I("img", { src: e, alt: "" }));
  document.body.append(t);
}, Fs = (e, t) => I("a", { class: "icon-btn save-btn", href: e, download: t.name, title: "Сохранить", onclick: (n) => {
  n.stopPropagation(), ve && (n.preventDefault(), $s(e, t.name, t.type));
} }, ne("download")), Jd = (e) => /ogg/.test(e) ? "ogg" : /mp4/.test(e) ? "mp4" : "webm", zs = (e) => ({ name: `${e.kind === "voice" ? "voice" : "circle"}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${Jd(e.type)}`, size: e.blob.size, type: (e.type || e.blob.type || (e.kind === "voice" ? "audio/webm" : "video/webm")).split(";")[0], dur: Math.round(e.duration * 10) / 10, peaks: e.peaks }), Yd = (e, t, n) => !!(t && t.kind !== "system" && e.kind !== "system" && n(t) === n(e) && e.ts - t.ts < 5 * 6e4 && !e.reply), Xd = (e, t) => [e.kind, e.status, e.progress != null ? Math.round(e.progress * 25) : "", e.upload != null ? Math.round(e.upload * 25) : "", JSON.stringify(e.reactions || {}), t, e.synced ? 1 : 0, Xe.enabled() ? "g" : ""].join("|"), _s = (e, t, n, r, { before: a = [], after: i = [], scroll: s = false } = {}) => {
  let m = e.scrollHeight - e.scrollTop - e.clientHeight < 160, u = [...a], f = /* @__PURE__ */ new Set(), h = null;
  for (let k of t) {
    let D = Yd(k, h, n.authorOf), w = Xd(k, D), x = r.get(k.id);
    (!x || x.sig !== w) && (x = { sig: w, node: qd(k, h, n) }, r.set(k.id, x)), u.push(x.node), f.add(k.id), h = k;
  }
  u.push(...i);
  for (let k of [...r.keys()]) f.has(k) || r.delete(k);
  let y = e.firstChild;
  for (let k of u) {
    if (k === y) {
      y = y.nextSibling;
      continue;
    }
    e.insertBefore(k, y);
  }
  for (; y; ) {
    let k = y.nextSibling;
    y.remove(), y = k;
  }
  (s || m) && (e.scrollTop = e.scrollHeight);
}, Ns = (e, t) => {
  let n = e.querySelector(`.msg[data-id="${CSS.escape(t)}"]`);
  if (!n) {
    H("Исходное сообщение не найдено");
    return;
  }
  n.scrollIntoView({ block: "center", behavior: "smooth" }), n.classList.remove("flash"), n.offsetWidth, n.classList.add("flash");
}, Vs = (e, t, { onReact: n, onReply: r, onDelete: a, deleteLabel: i }) => {
  Re.replaceChildren(I("div", { class: "menu-reacts" }, ...qt.map((f) => I("button", { text: f, onclick: () => {
    vt(), n(f);
  } }))), I("button", { onclick: () => {
    vt(), r();
  } }, ne("reply", "sm"), "Ответить"), t.kind === "text" ? I("button", { onclick: () => {
    vt(), dt(t.text, "Текст скопирован");
  } }, ne("copy", "sm"), "Копировать текст") : null, a ? I("button", { class: "danger", onclick: () => {
    vt(), a();
  } }, ne("trash", "sm"), i) : null), Re.classList.remove("hidden");
  let s = Re.getBoundingClientRect(), m = e?.clientX ?? innerWidth / 2, u = e?.clientY ?? innerHeight / 2;
  Re.style.left = `${Math.max(8, Math.min(m, innerWidth - s.width - 8))}px`, Re.style.top = `${Math.max(8, Math.min(u, innerHeight - s.height - 8))}px`;
}, ye = null, Ks = 60, Ws = 2 * Math.PI * 48, Zd = async (e) => {
  if (!ye) {
    if (!qa()) {
      H("Запись видео не поддерживается на этом устройстве", "bad");
      return;
    }
    if (ye = { rec: null, onDone: e, facing: "user", timer: null }, !await Gs()) {
      ye = null;
      return;
    }
    c("circle-overlay").classList.remove("hidden"), c("circ-prog").setAttribute("stroke-dasharray", String(Ws));
    try {
      let t = (await navigator.mediaDevices.enumerateDevices()).filter((n) => n.kind === "videoinput");
      c("circ-flip").classList.toggle("hidden", t.length < 2);
    } catch {
    }
    ye.timer = setInterval(() => {
      if (!ye?.rec) return;
      let t = ye.rec.elapsed;
      c("circ-time").textContent = Dn(t), c("circ-prog").setAttribute("stroke-dashoffset", String(Ws * (1 - Math.min(1, t / Ks)))), t >= Ks && Ys();
    }, 100);
  }
}, Gs = async () => {
  ye.rec?.cancel();
  let e = new Fa(K.ctx);
  try {
    await K.resume(), await e.start("circle", { facingMode: ye.facing, micId: v.micId });
  } catch (n) {
    return H("Камера или микрофон недоступны: " + n.message, "bad"), false;
  }
  ye.rec = e;
  let t = c("circ-video");
  return t.srcObject = new MediaStream(e.stream.getVideoTracks()), t.classList.toggle("mirror", ye.facing === "user"), t.play().catch(() => {
  }), true;
}, Js = () => {
  ye && (clearInterval(ye.timer), c("circ-video").srcObject = null, c("circle-overlay").classList.add("hidden"), ye = null);
}, Ys = async () => {
  if (!ye?.rec) return;
  let { rec: e, onDone: t } = ye;
  Js();
  let n = await e.stop();
  if (!n || n.duration < 0.7) {
    H("Слишком коротко");
    return;
  }
  t({ kind: "circle", ...n });
}, ca = () => {
  ye?.rec?.cancel(), Js();
};
c("circ-send").addEventListener("click", Ys), c("circ-cancel").addEventListener("click", ca), c("circ-flip").addEventListener("click", async () => {
  ye && (ye.facing = ye.facing === "user" ? "environment" : "user", await Gs());
});
var Xs = ({ composer: e, input: t, sendBtn: n, attachBtn: r, fileInput: a, voiceBtn: i, circleBtn: s, replyBar: m, onText: u, onFiles: f, onMedia: h, onTyping: y }) => {
  let k = null, D = null, w = () => e.classList.toggle("has-text", t.value.trim().length > 0), x = (L) => {
    k = L, m.classList.toggle("hidden", !L), L && (m.replaceChildren(ne("reply", "sm"), I("div", { class: "rb-main" }, I("b", { text: `Ответ ${L.name}` }), I("span", { text: L.text })), I("button", { class: "icon-btn", title: "Отменить ответ", onclick: () => x(null) }, ne("x", "sm"))), t.focus());
  }, g = () => {
    let L = k;
    return x(null), L;
  }, T = () => {
    let L = t.value.trim();
    if (L && Xe.enabled() && Xe.isBad(L)) {
      H("Режим защиты включён — такие слова отправлять нельзя", "bad");
      return;
    }
    L && (t.value = "", Us(t), w(), u(L.slice(0, 4e3), g()));
  };
  t.addEventListener("input", () => {
    Us(t), w(), y?.();
  }), t.addEventListener("keydown", (L) => {
    L.key === "Enter" && !L.shiftKey && !L.isComposing && (L.preventDefault(), T()), L.key === "Escape" && k && x(null);
  }), t.addEventListener("paste", (L) => {
    let C = [...L.clipboardData?.files || []];
    C.length && (L.preventDefault(), f(C, g()));
  }), n.addEventListener("click", T), r.addEventListener("click", () => a.click()), a.addEventListener("change", () => {
    f([...a.files], g()), a.value = "";
  });
  let S = async () => {
    if (D) return;
    if (!qa()) {
      H("Запись голосовых не поддерживается на этом устройстве", "bad");
      return;
    }
    let L = new Fa(K.ctx);
    try {
      await K.resume(), await L.start("voice", { micId: v.micId });
    } catch (se) {
      H("Нет доступа к микрофону: " + se.message, "bad");
      return;
    }
    let C = I("div", { class: "rec-wave" }, ...Array.from({ length: 36 }, () => I("i"))), G = I("span", { class: "rec-time", text: "0:00" }), te = () => {
      clearInterval(fe), ie.remove(), e.classList.remove("recording"), D = null;
    }, ae = async () => {
      te();
      let se = await L.stop();
      if (!se || se.duration < 0.5) {
        H("Слишком коротко — нажми и говори");
        return;
      }
      h({ kind: "voice", ...se }, g());
    }, Y = () => {
      te(), L.cancel();
    }, ie = I("div", { class: "rec-bar" }, I("button", { class: "icon-btn danger", title: "Удалить", onclick: Y }, ne("trash")), I("span", { class: "rec-dot" }), G, C, I("button", { class: "send-btn", title: "Отправить", onclick: ae }, ne("send")));
    e.append(ie), e.classList.add("recording");
    let fe = setInterval(() => {
      G.textContent = Dn(L.elapsed);
      let se = L.levels.slice(-36), z = C.children;
      for (let p = 0; p < z.length; p++) {
        let E = se[p - (z.length - se.length)] || 0;
        z[p].style.height = `${Math.max(10, Math.min(100, Math.sqrt(E / 0.15) * 100))}%`;
      }
      L.elapsed >= 300 && ae();
    }, 80);
    D = { cancel: Y };
  };
  return i.addEventListener("click", S), s.addEventListener("click", () => Zd((L) => h(L, g()))), w(), { setReply: x, cancelRecording: () => D ? (D.cancel(), true) : false, hasReply: () => !!k };
}, Zs = /* @__PURE__ */ new Map(), Qs = null, Qd = (e) => ({ myKey: "me", authorOf: (t) => t.mine ? "me" : "them", profileOf: (t) => t.mine ? at() : e, status: (t) => t.mine ? t.status : null, getUrl: (t) => _e.url(t.id), uploadText: (t) => t.mine && t.upload != null && t.upload < 1 ? `отправка ${Math.round(t.upload * 100)}%` : "", saveLink: Fs, openExternal: he.openExternal, reactorsText: (t) => t.map((n) => n === "me" ? "Ты" : e.name).join(", "), onAction: (t, n, r) => da(e, t, n, r) }), da = async (e, t, n, r) => {
  t === "react" ? (await W.react(e.pub, n.id, r), $e()) : t === "reply" ? ro.setReply({ id: n.id, name: n.mine ? v.name : e.name, text: yn(n) }) : t === "jump" ? Ns(c("dm-messages"), r) : t === "lightbox" ? qs(r) : t === "menu" && Vs(r, n, { onReact: (a) => da(e, "react", n, a), onReply: () => da(e, "reply", n), deleteLabel: n.mine ? "Удалить у всех" : "Удалить у себя", onDelete: async () => {
    await W.deleteMessage(e.pub, n.id), $e();
  } });
}, ua = false, ma = () => {
  ua || (ua = true, requestAnimationFrame(() => {
    ua = false, $e();
  }));
}, $e = async (e = false) => {
  if (V.type !== "dm") return;
  let t = W.get(V.pub);
  if (!t) return;
  let n = W.isOnline(t.pub);
  c("dm-who").replaceChildren(js(t, "lg", n), I("div", { class: "f-main" }, I("div", { class: "f-name", text: t.name }), I("div", { class: `f-sub${t.typingUntil > Date.now() ? " typing-sub" : ""}`, text: Os(t) }))), c("dm-call").disabled = !n, c("dm-video").disabled = !n, c("dm-invite").disabled = !l || !!l.record.ephemeral || !W.canInvite(t.pub), c("dm-input").placeholder = `Написать ${t.name}…`;
  let r = t.pub, a = await W.getHistory(r);
  if (V.type !== "dm" || V.pub !== r) return;
  Qs !== r && (Zs.clear(), Qs = r, c("dm-messages").replaceChildren());
  let i = a.length ? [] : [I("div", { class: "dm-empty" }, Te(t, "xxl"), I("h2", { text: t.name }), I("p", { text: t.bio || "Это начало вашей переписки. Сообщения, голосовые и кружочки идут напрямую и зашифрованы." }))], s = !n && a.some((m) => m.mine && m.status === "pending") ? [I("div", { class: "offline-note" }, ne("clock", "sm"), "Сообщения в очереди. Pulse повторит доставку при подключении.")] : [];
  _s(c("dm-messages"), a, Qd(t), Zs, { before: i, after: s, scroll: e }), c("dm-typing").textContent = t.typingUntil > Date.now() ? `${t.name} печатает` : "";
}, eu = 100 * 1024 * 1024, eo = (e) => ({ name: e.name.slice(0, 180) || "файл", size: e.size, type: /^[\w.+-]+\/[\w.+-]+$/.test(e.type) ? e.type : "application/octet-stream" }), to = async (e, t) => {
  if (V.type !== "dm") return;
  let n = V.pub;
  for (let r of e) {
    if (r.size > eu) {
      H(`«${r.name}» больше 100 МБ`, "bad");
      continue;
    }
    await W.sendMessage(n, { kind: "file", file: eo(r), reply: t }, r), t = null;
  }
  $e(true);
}, no = 0, ro = Xs({ composer: c("dm-composer"), input: c("dm-input"), sendBtn: c("dm-send"), attachBtn: c("dm-attach"), fileInput: c("dm-file-input"), voiceBtn: c("dm-voice"), circleBtn: c("dm-circle"), replyBar: c("dm-reply"), onText: async (e, t) => {
  V.type === "dm" && (await W.sendMessage(V.pub, { kind: "text", text: e, reply: t }), $e(true));
}, onFiles: to, onMedia: async (e, t) => {
  V.type === "dm" && (await W.sendMessage(V.pub, { kind: e.kind, file: zs(e), reply: t }, e.blob), $e(true));
}, onTyping: () => {
  V.type === "dm" && Date.now() - no > 2500 && (no = Date.now(), W.typing(V.pub));
} });
c("dm-call").addEventListener("click", () => V.type === "dm" && kn(V.pub, false)), c("dm-video").addEventListener("click", () => V.type === "dm" && kn(V.pub, true)), c("dm-invite").addEventListener("click", () => V.type === "dm" && pa(V.pub)), c("dm-more").addEventListener("click", (e) => {
  let t = V.type === "dm" && W.get(V.pub);
  if (t) {
    let n = e.currentTarget.getBoundingClientRect();
    Hs(t, n.right - 220, n.bottom + 6);
  }
});
var pa = async (pub) => {
  const room = l;
  const friend = W.get(pub);
  if (!room || !friend || room.invitePending.has(pub)) return false;
  if (room.record.ephemeral) {
    H("Из личного звонка позвать нельзя — создай комнату", "bad");
    return false;
  }
  room.invitePending.add(pub);
  wo();
  try {
    const sent = await W.invite(pub, room.code, room.record.name);
    if (l !== room) return false;
    if (sent) {
      room.invited.add(pub);
      H(`Приглашение для ${friend.name} отправлено`, "ok");
    } else {
      H("Не удалось отправить приглашение. Можно скопировать код комнаты.", "bad");
    }
    return sent;
  } finally {
    room.invitePending.delete(pub);
    if (l === room) wo();
  }
}, ge = null, ao = (e, t, n) => {
  c("ring-avatar").replaceChildren(Te(e, "xxl")), c("ring-name").textContent = e.name, c("ring-sub").textContent = t, c("ring-accept").classList.toggle("hidden", !n), c("ring-accept-video").classList.toggle("hidden", !n), c("ring-decline").title = n ? "Отклонить" : "Отменить", c("ring-overlay").classList.remove("hidden");
}, Gt = () => {
  ge && (clearTimeout(ge.timer), ge = null, K.stopLoop(), c("ring-overlay").classList.add("hidden"));
}, kn = async (e, t) => {
  let n = W.get(e);
  if (!n) return;
  if (!W.isOnline(e)) {
    H(`${n.name} · ${Os(n)}`, "info");
    return;
  }
  if (!W.isDirect(e)) {
    H(`Соединяемся с ${n.name} напрямую — попробуй через несколько секунд`, "info");
    return;
  }
  if (ge) return;
  await K.resume();
  let r = Va(crypto.getRandomValues(new Uint8Array(18)));
  W.ring(e, r, t), ge = { dir: "out", pub: e, callId: r, video: t, timer: setTimeout(() => {
    W.cancelRing(e, r), Gt(), H(`${n.name} не отвечает`, "bad");
  }, 45e3) }, ao(n, t ? "Видеовызов…" : "Вызов…", false), K.startLoop("dial", 2400);
}, io = async (e) => {
  if (!ge || ge.dir !== "in") return;
  let { pub: t, callId: n } = ge, r = W.get(t);
  Gt(), W.answerRing(t, n, true), l && await kt({ silent: true }), await ha(`pulse-${n}`, { ephemeral: true, name: r.name, profile: r, video: e });
};
c("ring-accept").addEventListener("click", () => io(false)), c("ring-accept-video").addEventListener("click", () => io(true)), c("ring-decline").addEventListener("click", () => {
  ge && (ge.dir === "in" ? W.answerRing(ge.pub, ge.callId, false) : W.cancelRing(ge.pub, ge.callId), Gt());
});
var tu = { onChange: () => {
  Wt(), He(), V.type === "dm" && (W.get(V.pub) ? $e() : wt(null)), l && wo(), Aa();
}, onRequest: (e) => {
  v.sounds && K.beep("request"), he.notify("Заявка в друзья", `${e.name} хочет добавить тебя`), H(`${e.name} хочет добавить тебя в друзья`, "info");
}, onAccepted: (e) => H(`${e.name} теперь твой друг!`, "ok"), onDeclined: (e) => H(`${e.name} отклонил(а) заявку`, "bad"), onRemoved: (e) => H(`${e.name} удалил(а) тебя из друзей`, "bad"), onPresence: () => {
}, onMessage: (e, t) => {
  V.type === "dm" && V.pub === e.pub && document.hasFocus() || (bn.set(e.pub, (bn.get(e.pub) || 0) + 1), v.sounds && K.beep("message"), he.notify(e.name, Xe.enabled() ? Xe.mask(yn(t)) : yn(t), { pub: e.pub, color: e.color, kind: t.kind === "text" ? "message" : "media" })), V.type === "dm" && V.pub === e.pub && $e(), wn(), He();
}, onDelivery: (e) => V.type === "dm" && V.pub === e?.pub && ma(), onProgress: (e) => V.type === "dm" && V.pub === e?.pub && ma(), onUpdate: (e) => V.type === "dm" && V.pub === e?.pub && ma(), onTyping: (e) => {
  let t = () => {
    wn(), V.type === "dm" && V.pub === e.pub && $e();
  };
  t(), setTimeout(t, 3600);
}, onRing: (e, { callId: t, video: n }) => {
  if (ge || l?.code === `pulse-${t}`) {
    W.answerRing(e.pub, t, false);
    return;
  }
  ge = { dir: "in", pub: e.pub, callId: t, video: n, timer: setTimeout(() => {
    Gt(), H(`Пропущенный звонок от ${e.name}`, "bad", 1e4);
  }, 45e3) }, ao(e, n ? "Входящий видеозвонок" : "Входящий звонок", true), K.resume(), K.startLoop("ring", 2e3), he.focus(), he.notify(e.name, n ? "Входящий видеозвонок" : "Входящий звонок", { pub: e.pub, color: e.color, kind: "call" });
}, onRingCancel: (e, t) => {
  ge?.dir === "in" && ge.pub === e.pub && ge.callId === t && (Gt(), H(`Пропущенный звонок от ${e.name}`, "bad", 1e4));
}, onRingAnswer: async (e, t, n) => {
  if (ge?.dir !== "out" || ge.pub !== e.pub || ge.callId !== t) return;
  let r = ge.video;
  if (Gt(), !n) {
    H(`${e.name} сейчас не может ответить`, "bad");
    return;
  }
  l && await kt({ silent: true }), await ha(`pulse-${t}`, { ephemeral: true, name: e.name, profile: e, video: r });
}, onInvite: (e, t) => {
  const code = xs(t?.code);
  if (!code || code !== t.code || l?.code === code) return;
  const name = ct(t.name) || "комната";
  if (v.sounds) K.beep("request");
  he.notify(e.name, `Зовёт в «${name}»`);
  Cs(`${e.name} зовёт тебя в «${name}»`, [{ label: "Зайти", primary: true, fn: () => {
    Sn(code, { name });
  } }, { label: "Позже" }]);
} }, fa = (e) => `Залетай в Pulse — комната «${e.name}»
Код: ${e.code}`, xn = (e, t, n = null, r = false) => {
  let a = nt.find((i) => i.code === e);
  return a || (a = { code: e, name: t || `Комната ${nt.length + 1}`, icon: yr(n) ? n : null, color: Jn[nt.length % Jn.length], created: Date.now(), metaTs: r ? Date.now() : 0 }, nt.push(a), rt(), He()), a;
}, so = async (e) => {
  let t = ct(await Wd("Название комнаты", e.name));
  t && (e.name = t, e.metaTs = Date.now(), rt(), lo(e));
}, oo = async (e) => {
  let t = await En();
  if (t) try {
    e.icon = await vr(t, 192), e.metaTs = Date.now(), rt(), lo(e);
  } catch (n) {
    H(n.message, "bad");
  }
}, lo = (e) => {
  He(), l?.code === e.code && (Ae(), mo());
}, nu = async (e) => {
  await Kt(`Убрать «${e.name}» из списка? Вернуться можно по коду.`, "Убрать") && (l?.code === e.code && await kt(), nt = nt.filter((t) => t !== e), rt(), He());
}, Sn = async (e, { create = false, name, icon, pub, signal } = {}) => {
  if (!isRoomCode(e) || signal?.aborted) return false;
  if (l?.code === e) {
    oa();
    return true;
  }
  if (roomEntryPending) return false;
  roomEntryPending = true;
  try {
    traceRoom(create ? "room.create" : "room.join", e);
    const saved = nt.find(room => room.code === e);
    let published;
    let voiceConfirmed = false;
    if (!saved && !create) {
      const result = await verifyRoomEntry({
        code: e, pool: Qt.getPool(), identity: Ee(), profile: at(), signal,
        watchDirectPeer: (onPeer, probeSignal) => watchDirectRoomPeer(e, onPeer, probeSignal),
        watchVoicePeer: v.reserveVoice === false ? undefined : (onPeer, probeSignal) => watchVoiceRoomPeer(e, onPeer, probeSignal),
      });
      if (signal?.aborted || result.status === "cancelled") return false;
      if (result.status !== "live" && result.status !== "public") {
        traceRoom("room.timeout", e);
        H(result.status === "not-found"
          ? "Комната по этому коду пока не найдена. Проверь код и попроси создателя открыть комнату."
          : "Не удалось проверить код комнаты. Проверь соединение и попробуй ещё раз.", "bad", 7000);
        return false;
      }
      published = result.room;
      voiceConfirmed = result.transport === "voice";
    }
    if (l) await kt({ silent: true });
    if (signal?.aborted) return false;
    const record = saved ?? xn(e, ct(published?.name) || name || (create ? undefined : "Комната друга"),
      published?.icon ?? icon, create);
    if (create) {
      record.pub = Boolean(pub);
      rt();
    }
    return await ha(e, { record, voiceConfirmed });
  } finally {
    roomEntryPending = false;
  }
}, Qn = null, ga = () => c("rm-icon-preview").replaceChildren(Te({ name: c("rm-name").value || "#", avatar: Qn, color: v.color }, "xl")), co = (e) => {
  document.querySelectorAll("#rm-tabs button").forEach((t) => t.classList.toggle("active", t.dataset.v === e)), c("rm-create").classList.toggle("hidden", e !== "create"), c("rm-join").classList.toggle("hidden", e !== "join");
}, uo = (e = "create") => {
  Qn = null, c("rm-name").value = "", c("rm-code").value = "", ga(), co(e), At("room-modal"), setTimeout(() => (e === "create" ? c("rm-name") : c("rm-code")).focus(), 60);
};
let roomEntryPending = false;

async function watchDirectRoomPeer(code, onPeer, signal) {
  const native = await Ss(code, v, {});
  if (!signal.aborted) {
    const hello = native.makeAction("hello");
    const greet = async peerId => {
      const profile = await Ft(native, peerId, at());
      if (!signal.aborted) await hello.send(profile, { target: peerId });
    };
    hello.onMessage = async (payload, { peerId }) => {
      const peer = await Kn(native, peerId, payload);
      if (!signal.aborted && peer && peer.pub !== Ee().pub && native.getPeers()[peerId]) onPeer();
    };
    native.onPeerJoin = peerId => { greet(peerId).catch(() => {}); };
  }
  return () => native.leave();
}

async function watchVoiceRoomPeer(code, onPeer, signal) {
  const { openRoomVoice } = await import("./room-voice.js");
  if (!signal.aborted) return openRoomVoice({
    code, identity: Ee(), profile: at,
    allowAudioFor: () => false,
    onPeer: () => { if (!signal.aborted) onPeer(); },
  });
}

async function submitRoomDialog(button, code, options) {
  if (roomDialogCheck || roomEntryPending) return;
  const check = roomDialogCheck = new AbortController();
  const label = button.textContent;
  button.disabled = true;
  button.textContent = options.create ? "Создаём…" : "Проверяем код…";
  try {
    if (await Sn(code, { ...options, signal: check.signal })) je("room-modal");
  } finally {
    roomDialogCheck = null;
    button.disabled = false;
    button.textContent = label;
  }
}

document.querySelectorAll("#rm-tabs button").forEach((e) => e.addEventListener("click", () => co(e.dataset.v))), c("rm-name").addEventListener("input", ga), c("rm-icon").addEventListener("click", async () => {
  let e = await En();
  if (e) try {
    Qn = await vr(e, 192), ga();
  } catch (t) {
    H(t.message, "bad");
  }
}), c("rm-create-btn").addEventListener("click", event => {
  void submitRoomDialog(event.currentTarget, Ed(), {
    create: true, name: ct(c("rm-name").value), icon: Qn, pub: c("rm-public").checked,
  });
}), c("rm-name").addEventListener("keydown", (e) => e.key === "Enter" && c("rm-create-btn").click()), c("rm-join-btn").addEventListener("click", event => {
  let e = c("rm-code").value, t = xs(e);
  if (!t) {
    H("Это не код комнаты. Он начинается с «pulse-»", "bad");
    return;
  }
  let n = e.match(/комната «([^»]{1,40})»/);
  void submitRoomDialog(event.currentTarget, t, { name: n ? ct(n[1]) : undefined });
}), c("rm-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    c("rm-join-btn").click();
  }
});
function updateRoomLinks(room) {
  if (l !== room || !room.links) return;
  const online = room.links.members();
  for (const [id, peer] of room.peers) {
    if (peer.reserve && !online.has(peer.pub)) {
      room.peers.delete(id);
      K.detachPeer(id);
      Tn(id);
    }
  }
  for (const [pub, link] of online) {
    const id = "remote:" + pub;
    const peer = er(id);
    Object.assign(peer, yt(link.profile), { pub, dhPub: link.profile.dhPub, helloed: true, reserve: true,
      voiceConnection: link.connection, reserveVoice: link.voice, trust: W.isFriend(pub) ? "known" : "new" });
    peer.state.mic = Boolean(link.stream);
    if (peer.voiceStream !== link.stream) {
      peer.voiceStream = link.stream;
      if (link.stream) {
        K.attach(id + ":mic", id, link.stream);
        K.setPeerVolume(id, tr(peer));
        K.setPeerMuted(id, peer.muted);
      } else K.detachPeer(id);
    }
    na.set(pub, { ...yt(link.profile), pub });
  }
  const authenticated = new Set([...room.peers.values()].filter(peer => peer.pub && peer.trust !== "bad").map(peer => peer.pub));
  if (authenticated.size && !room.hadPeers) {
    traceRoom(room.everHadPeers ? "room.reconnect" : "room.confirmed", room.code, authenticated.size);
    room.everHadPeers = true;
  }
  room.hadPeers = authenticated.size > 0;
  room.links.syncMicrophone();
  st();
  Ae();
}

function startRoomChatRelay(room) {
  if (room.record.ephemeral) return;
  room.links = new RoomLinks({
    code: room.code, pool: Qt.getPool(), identity: Ee(), getProfile: at, getMicrophone: () => room.micStream,
    directKeys: () => new Set([...room.peers.values()].filter(p => !p.reserve && p.pub && p.trust !== "bad").map(p => p.pub)),
    onChange: () => updateRoomLinks(room),
    onText: (message, pub) => { if (l === room) Pu(message, "remote:" + pub).catch(console.warn); },
    openChat: openRoomRelay,
    openVoice: async options => (await import("./room-voice.js")).openRoomVoice(options)
  });
  room.links.startChat().catch(console.warn);
  let retryAfter = 0, retryDelay = 30000;
  const tryVoice = () => {
    if (l !== room || v.reserveVoice === false || Date.now() < retryAfter) return;
    // A later participant may be reachable only through the reserve service.
    // Already connected peers continue to receive microphone audio directly.
    room.links.startVoice().then(() => { retryDelay = 30000; }).catch(error => {
      retryAfter = Date.now() + retryDelay;
      retryDelay = Math.min(retryDelay * 2, 300000);
      console.warn(error);
    });
  };
  room.voiceTimer = setTimeout(() => {
    tryVoice();
    if (l === room) room.timers.push(setInterval(tryVoice, 30_000));
  }, room.voiceConfirmed ? 0 : 9000);
}

var ru = async (e) => `chat:${Oa(await Ka(`pulse-chat:${e}`)).slice(0, 24)}`, roomClosing = null, ha = async (e, t = {}) => {
  if (l) return;
  K.resume();
  if (Nt) {
    K.stopMic();
    Nt = false;
  }
  const n = t.ephemeral
    ? { code: e, name: t.name || "Звонок", ephemeral: true, icon: t.profile?.avatar || null, color: t.profile?.color }
    : t.record ?? xn(e);
  if (!t.ephemeral) {
    n.last = Date.now();
    rt();
  }
  const r = l = {
    code: e, record: n, room: null, connecting: null, A: null, peers: new Map(),
    startedAt: Date.now(), micMuted: v.joinMuted, deafened: false, vadOpen: false,
    lastVoice: 0, pttDown: false, micStream: null, sendTrack: null, camStream: null,
    screenStream: null, messages: [], msgIds: new Set(), chatKey: null, focusKey: null,
    timers: [], networkTimer: null, waitedForPeers: false, peerConnectionError: null, voiceConfirmed: t.voiceConfirmed,
    lastTypingSent: 0, joinErrors: new Set(),
    invited: new Set(), invitePending: new Set(), selfLvl: 0,
  };
  try {
    if (!t.ephemeral) r.chatKey = await ru(e);
    if (l !== r) return;
    c("messages").replaceChildren();
    Sa.clear();
    c("grid").replaceChildren();
    oa();
    if (v.saveHistory && r.chatKey) {
      for (const message of pe.get(r.chatKey, [])) {
        const saved = xa(message);
        if (saved) Pn({ ...saved, synced: true, reactions: wu(message.reactions) }, { save: false });
      }
    }
    Ia(t.ephemeral ? `Звонок с ${n.name}` : `Поиск участников комнаты «${n.name}»`);
    // Rejoining the same code must wait for the previous transport to leave.
    if (roomClosing) await roomClosing;
    if (l !== r) return;
    startRoomChatRelay(r);
    r.connecting = Ss(e, v, { onJoinError: error => { if (l === r) au(error); } });
    r.room = await r.connecting;
  } catch (a) {
    if (l === r) {
      console.error(a);
      H("Не удалось подключиться к сети: " + a.message, "bad", 6e3);
      await kt();
    }
    return;
  }
  if (l !== r) return;
  iu(), he.setInCall?.(true), xe("self"), Je(), st(), Ae(), bt(), He(), t.video && ho();
  r.timers.push(setInterval(Mu, 80), setInterval(Au, 2e3), setInterval(Fo, 1500), setInterval(zo, 1e3), setInterval(Ea, 1e3));
  Fo(), zo();
  r.networkTimer = setTimeout(() => {
    if (l === r) {
      r.waitedForPeers = true;
      Fo();
    }
  }, 12e3);
  mu(r).catch(error => {
    if (l === r) {
      console.warn(error);
      H("Микрофон недоступен — можно слушать и писать в чат", "bad", 5e3);
    }
  });
  return true;
}, au = ({ error: e, peerId: t }) => {
  if (!l || l.joinErrors.has(t)) return;
  l.joinErrors.add(t);
  console.warn("join error", t, e);
  if (/password/i.test(e)) return;
  l.peerConnectionError = /after exchanging SDP/i.test(e) ? "ice" : "handshake";
  Fo();
  if (l.peers.size && [...l.peers.values()].every(peer => !peer.reserve)) H("Подключение к одному из участников не удалось", "bad", 9e3);
}, kt = async ({ silent: e = false } = {}) => {
  if (!l) return roomClosing;
  const t = l;
  l = null;
  clearTimeout(t.voiceTimer);
  t.links?.close();
  const closing = t.connecting?.then(room => room.leave()).catch(() => {});
  if (closing) roomClosing = closing;
  t.timers.forEach(clearInterval), clearTimeout(t.networkTimer), he.setInCall?.(false), or();
  t.camStream?.getTracks().forEach((n) => n.stop()), vo(), t.screenStream?.getTracks().forEach((n) => n.stop());
  for (let n of t.peers.keys()) K.detachPeer(n);
  K.stopMic(), c("grid").replaceChildren(), c("people").replaceChildren(), c("messages").replaceChildren(), Sa.clear(), cr.cancelRecording(), cr.setReply(null), We.clear(), Jt.clear(), !e && v.sounds && K.beep("leave"), V.type === "room" ? wt(aa) : (Wt(), He()), bt();
  if (closing) {
    await closing;
    if (roomClosing === closing) roomClosing = null;
  }
};
c("btn-leave").addEventListener("click", () => kt()), window.addEventListener("beforeunload", () => {
  l?.links?.close();
  l?.room?.leave();
});
var iu = () => {
  const room = l;
  const e = room.room, t = room.A = { hello: e.makeAction("hello"), state: e.makeAction("state"), chat: e.makeAction("chat"), sync: e.makeAction("sync"), file: e.makeAction("file"), typing: e.makeAction("typing"), meta: e.makeAction("meta"), react: e.makeAction("react"), del: e.makeAction("del") };
  const whileCurrent = callback => (...args) => {
    if (l === room) return callback(...args);
  };
  t.hello.onMessage = whileCurrent((n, { peerId: r }) => cu(n, r));
  t.state.onMessage = whileCurrent((n, { peerId: r }) => du(n, r));
  t.chat.onMessage = whileCurrent((n, { peerId: r }) => Pu(n, r));
  t.sync.onMessage = whileCurrent(Iu);
  t.meta.onMessage = whileCurrent(su);
  t.react.onMessage = whileCurrent((n, { peerId: r }) => Eu(n, r));
  t.del.onMessage = whileCurrent((n, { peerId: r }) => Du(n, r));
  t.typing.onMessage = whileCurrent((n, { peerId: r }) => {
    let a = room.peers.get(r);
    a && (a.typingUntil = Date.now() + 3500, Ea());
  });
  t.file.onReceive = ({ byteLength: n }) => l === room && n <= 512 * 1024 * 1024;
  t.file.onReceiveProgress = whileCurrent((n, { metadata: r }) => {
    let a = room.messages.find((i) => i.id === r?.id);
    a && a.progress != null && (a.progress = Math.min(n, 0.99), Rt());
  });
  t.file.onMessage = whileCurrent((n, { metadata: r }) => Lu(n, r));
  e.onPeerJoin = whileCurrent(ou);
  e.onPeerLeave = whileCurrent(lu);
  e.onPeerStream = whileCurrent(uu);
}, mo = (e = null) => {
  let t = l?.record;
  !t || t.ephemeral || !t.metaTs || l.A?.meta.send({ name: t.name, icon: t.icon, ts: t.metaTs }, e ? { target: e } : void 0).catch(() => {
  });
}, su = (e) => {
  let t = l?.record;
  if (!t || t.ephemeral || !e || typeof e.ts != "number" || e.ts <= (t.metaTs || 0) || e.ts > Date.now() + 6e4) return;
  let n = ct(e.name);
  n && (t.name = n), t.icon = yr(e.icon) ? e.icon : null, t.metaTs = e.ts, rt(), He(), Ae();
}, er = (e) => {
  let t = l.peers.get(e);
  return t || (t = { id: e, name: "Подключается…", color: "#4a4f66", avatar: null, bio: "", pub: null, trust: "pending", helloed: false, state: { mic: true, deaf: false, cam: false, screen: false }, cam: null, screen: null, stats: null, lvl: 0, typingUntil: 0, muted: false }, l.peers.set(e, t)), t;
}, po = (e) => e.pub || `peer:${e.id}`, tr = (e) => v.volumes[po(e)] ?? 1, ou = (e) => {
  if (!l) return;
  l.peerConnectionError = null;
  l.joinErrors.delete(e);
  er(e);
  let t = { target: e };
  fo(e), xt(e), mo(e), l.micStream && l.room.addStream(l.micStream, { ...t, metadata: { kind: "mic" } }), l.camStream && l.room.addStream(l.camStream, { ...t, metadata: { kind: "cam" } }), l.screenStream && l.room.addStream(l.screenStream, { ...t, metadata: { kind: "screen" } });
  let n = l.messages.filter((r) => r.kind !== "system" && r.sig).slice(-150).map(lr);
  n.length && l.A.sync.send(n, t).catch(() => {
  }), setTimeout(() => Ps(l?.room?.getPeers()[e]), 1500), st(), Ae();
}, lu = (e) => {
  if (!l) return;
  let t = l.peers.get(e);
  if (t) {
    l.peers.delete(e);
    K.detachPeer(e);
    Tn(e);
    Tn(`${e}:screen`);
    updateRoomLinks(l);
    if (t.helloed && !l.peers.has("remote:" + t.pub)) {
      Ia(`${t.name} вышел(а)`);
      if (v.sounds) K.beep("leave");
    }
    st();
    Ae();
  }
}, fo = async (e) => {
  if (!l?.A) return;
  let t = l.room, n = await Ft(t, e, at());
  l?.room === t && l.A.hello.send(n, { target: e }).catch(() => {
  });
}, xt = (e = null) => {
  l?.A && l.A.state.send({ mic: !!l.sendTrack && !l.micMuted, deaf: l.deafened, cam: !!l.camStream, screen: !!l.screenStream }, e ? { target: e } : void 0).catch(() => {
  });
}, cu = async (e, t) => {
  if (!l || !e || typeof e != "object") return;
  let n = l, r = er(t), a = !r.helloed;
  r.helloed = true;
  let i = await Kn(n.room, t, e);
  if (l !== n) return;
  let s = i || yt(e);
  if (Object.assign(r, { name: s.name, color: s.color, avatar: s.avatar, bio: s.bio }), i) {
    let m = r.pub && r.pub !== i.pub;
    r.pub = i.pub, na.set(r.pub, s);
    let u = tt[r.pub];
    m ? r.trust = "bad" : u?.verified ? r.trust = "verified" : u || W.isFriend(r.pub) ? r.trust = "known" : (r.trust = "new", Object.entries(tt).find(([f, h]) => h.verified && f !== r.pub && h.name?.toLowerCase() === s.name.toLowerCase()) && H(`«${s.name}» зашёл с НОВЫМ ключом, не тем, что ты проверял(а). Сверь код безопасности!`, "bad", 1e4)), tt[r.pub] = { name: s.name, verified: u?.verified || false, firstSeen: u?.firstSeen || Date.now(), lastSeen: Date.now() }, ea();
  } else r.trust = "bad", H(`Не удалось подтвердить ключ «${s.name}». Возможна подмена!`, "bad", 8e3);
  updateRoomLinks(n);
  K.setPeerVolume(t, tr(r)), a && (Ia(`${r.name} зашёл(а)`), v.sounds && K.beep("join")), xe(t), r.screen && xe(`${t}:screen`), Ae();
}, du = (e, t) => {
  if (!l || !e || typeof e != "object") return;
  let n = er(t);
  n.state = { mic: !!e.mic, deaf: !!e.deaf, cam: !!e.cam, screen: !!e.screen }, n.state.cam || (n.cam = null), !n.state.screen && n.screen && (n.screen = null, K.detach(`${t}:screen`), Tn(`${t}:screen`)), xe(t), st(), Ae();
}, uu = (e, t, n) => {
  if (!l) return;
  let r = er(t), a = n && typeof n == "object" && typeof n.kind == "string" ? n.kind : e.getVideoTracks().length ? "cam" : "mic";
  a === "mic" ? (K.attach(`${t}:mic`, t, e), K.setPeerVolume(t, tr(r)), K.setPeerMuted(t, r.muted)) : a === "cam" ? (r.cam = e, r.state.cam = true, xe(t)) : a === "screen" && (r.screen = e, r.state.screen = true, e.getAudioTracks().length && K.attach(`${t}:screen`, t, e), xe(`${t}:screen`), l.focusKey || ir(`${t}:screen`)), e.addEventListener("removetrack", () => {
    e.getTracks().length || (r.cam === e && (r.cam = null, xe(t)), r.screen === e && (r.screen = null, K.detach(`${t}:screen`), Tn(`${t}:screen`)), st());
  }), st();
}, nr = () => ({ deviceId: v.micId, echoCancellation: v.ec, noiseSuppression: v.ns, autoGainControl: v.agc }), mu = async (room) => {
  const mic = await K.startMic(nr());
  if (!mic || K.mic !== mic || l !== room) return;
  const previous = room.sendTrack;
  const track = room.sendTrack = K.micSendTrack();
  Ge();
  if (previous && room.micStream) {
    room.room?.replaceTrack(previous, track);
    room.micStream.removeTrack(previous);
    room.micStream.addTrack(track);
  } else {
    room.micStream = new MediaStream([track]);
    room.room?.addStream(room.micStream, { metadata: { kind: "mic" } });
  }
  room.links?.syncMicrophone(true);
  xt();
  Je();
}, ya = async () => {
  const room = l;
  if (!room) {
    Nt && await K.startMic(nr()).catch(() => {
    });
    return;
  }
  if (!room.room) return;
  try {
    await mu(room);
  } catch (n) {
    if (l === room) H("Не удалось открыть микрофон: " + n.message, "bad");
  }
}, pu = () => {
  if (!l?.sendTrack) return;
  let e = K.micSendTrack();
  !e || e === l.sendTrack || (l.room?.replaceTrack(l.sendTrack, e), l.micStream.removeTrack(l.sendTrack), l.micStream.addTrack(e), l.sendTrack = e, Ge(), l.links?.syncMicrophone(true));
}, Ge = () => {
  if (!l) return;
  let e = v.mode === "open" ? true : v.mode === "vad" ? l.vadOpen : l.pttDown, t = !l.micMuted && !l.deafened && e;
  l.sendTrack && l.sendTrack.enabled !== t && (l.sendTrack.enabled = t);
}, va = () => {
  if (l) {
    if (!l.sendTrack) {
      ya();
      return;
    }
    if (l.deafened) {
      rr();
      return;
    }
    l.micMuted = !l.micMuted, v.sounds && K.beep(l.micMuted ? "mute" : "unmute"), Ge(), Je(), xt(), xe("self"), Ae();
  }
}, rr = () => {
  l && (l.deafened = !l.deafened, K.setDeafened(l.deafened), !l.deafened && v.sounds && K.beep("unmute"), Ge(), Je(), xt(), xe("self"), Ae());
};
c("btn-mic").addEventListener("click", va), c("btn-deaf").addEventListener("click", rr), he.onHotkeyMute(va), he.onHotkeyDeafen(rr), window.addEventListener("keydown", (e) => {
  !l || v.mode !== "ptt" || e.code !== v.pttKey || tl(e) || e.repeat || (l.pttDown = true, Ge());
}), window.addEventListener("keyup", (e) => {
  !l || e.code !== v.pttKey || (l.pttDown = false, Ge());
}), window.addEventListener("blur", () => {
  l?.pttDown && (l.pttDown = false, Ge());
});
var ba = (e) => e.replace(/^Key/, "").replace(/^Digit/, "").replace("Backquote", "`").replace("Space", "Пробел"), Je = () => {
  if (!l) return;
  let e = !l.sendTrack || l.micMuted || l.deafened, t = c("btn-mic");
  t.classList.toggle("off", e), Xt(t, e ? "mic-off" : "mic"), t.dataset.tip = e ? "Включить микрофон" : "Выключить микрофон";
  let n = c("btn-deaf");
  n.classList.toggle("off", l.deafened), Xt(n, l.deafened ? "head-off" : "head"), n.dataset.tip = l.deafened ? "Включить звук" : "Выключить звук";
  let r = c("btn-cam");
  r.classList.toggle("off", !l.camStream), r.classList.toggle("on", !!l.camStream), Xt(r, l.camStream ? "cam" : "cam-off"), c("btn-screen").classList.toggle("on", !!l.screenStream), c("btn-screen").dataset.tip = l.screenStream ? "Остановить показ" : "Демонстрация экрана";
  let a = v.mode === "ptt" ? `Рация: держи ${ba(v.pttKey)}` : v.mode === "vad" ? "По голосу" : "";
  c("mode-hint").textContent = a, c("mode-hint").classList.toggle("hidden", !a), bt();
}, go = () => {
  let e = Number(v.camQ) || 720;
  return { deviceId: v.camId ? { exact: v.camId } : void 0, width: { ideal: Math.round(e * 16 / 9) }, height: { ideal: e }, frameRate: { ideal: 30, max: 30 } };
}, ho = async () => {
  if (l) {
    if (l.camStream) l.room.removeStream(l.camStream), l.camStream.getTracks().forEach((e) => e.stop()), l.camStream = null;
    else try {
      let e = await navigator.mediaDevices.getUserMedia({ video: go(), audio: false });
      if (!l) {
        e.getTracks().forEach((t) => t.stop());
        return;
      }
      e.getVideoTracks()[0].contentHint = "motion", l.camStream = e, l.room.addStream(e, { metadata: { kind: "cam" } }), wa();
    } catch (e) {
      H("Камера недоступна: " + e.message, "bad");
    }
    xt(), Je(), xe("self");
  }
}, yo = async () => {
  if (l?.camStream) try {
    let e = await navigator.mediaDevices.getUserMedia({ video: go(), audio: false }), t = l.camStream.getVideoTracks()[0], n = e.getVideoTracks()[0];
    n.contentHint = "motion", l.room.replaceTrack(t, n), l.camStream.removeTrack(t), l.camStream.addTrack(n), t.stop(), xe("self");
  } catch (e) {
    H("Не удалось переключить камеру: " + e.message, "bad");
  }
};
c("btn-cam").addEventListener("click", ho);
var wa = () => setTimeout(() => {
  l?.room && Object.values(l.room.getPeers()).forEach(Ps);
}, 1500), Ue = { running: false, canvas: null, ctx: null, seq: 0, fps: 15 }, ka = (e, t) => {
  l && (Ue.fps = t, ve.startScreenShare(e, t) || H("Показ экрана доступен на Android 8 и новее", "bad"));
}, fu = (e, t) => {
  if (!l || l.screenStream) {
    ve.stopScreenShare();
    return;
  }
  let n = document.createElement("canvas");
  n.width = e, n.height = t;
  let r = n.getContext("2d", { alpha: false });
  r.fillStyle = "#000", r.fillRect(0, 0, e, t);
  let a = n.captureStream(Ue.fps);
  a.getVideoTracks()[0].contentHint = "detail", Object.assign(Ue, { running: true, canvas: n, ctx: r, seq: 0 }), gu(), l.screenStream = a, l.room.addStream(a, { metadata: { kind: "screen" } }), wa(), xt(), Je(), xe("self:screen"), st(), H("Экран показывается собеседникам", "ok");
}, gu = async () => {
  for (; Ue.running; ) {
    try {
      let e = await fetch(`/__screen/frame.jpg?after=${Ue.seq}`, { cache: "no-store" });
      if (e.status === 200) {
        Ue.seq = Number(e.headers.get("X-Seq")) || Ue.seq + 1;
        let t = await createImageBitmap(await e.blob()), { canvas: n, ctx: r } = Ue;
        (n.width !== t.width || n.height !== t.height) && (n.width = t.width, n.height = t.height), r.drawImage(t, 0, 0), t.close();
        continue;
      }
    } catch {
    }
    await new Promise((e) => setTimeout(e, 25));
  }
}, vo = () => {
  Ue.running && (Ue.running = false, ve.stopScreenShare());
};
window.__pulseScreen = (e, t, n) => {
  e === "started" ? fu(t, n) : e === "stopped" ? Ue.running && (Ue.running = false, ar()) : e === "denied" && H("Нет разрешения на показ экрана", "bad");
};
var hu = async (e) => {
  if (ve?.startScreenShare) {
    if (!l) return;
    if (l.screenStream) {
      ar();
      return;
    }
    let n = (e?.currentTarget || c("btn-screen")).getBoundingClientRect();
    Zn(n.left, n.top - 150, [{ label: "Показать экран · 720p", icon: "screen", fn: () => ka(1280, 15) }, { label: "Показать экран · 1080p", icon: "screen", fn: () => ka(1920, 12) }, { label: "Экономно · 480p", icon: "screen", fn: () => ka(854, 12) }]);
    return;
  }
  if (!l) return;
  if (l.screenStream) {
    ar();
    return;
  }
  if (c("screen-audio").closest(".switch").classList.toggle("hidden", ta !== "win32"), !he.getScreenSources) {
    bo(null);
    return;
  }
  let t = c("sources");
  t.replaceChildren(I("p", { class: "muted", text: "Загрузка…" })), At("screen-modal");
  try {
    let n = await he.getScreenSources();
    t.replaceChildren(...n.map((r, a) => I("button", { class: "source", style: { "animation-delay": `${a * 30}ms` }, onclick: () => {
      je("screen-modal"), bo(r.id);
    } }, r.thumb ? I("img", { src: r.thumb, alt: "" }) : null, I("div", { text: r.name }))));
  } catch {
    t.replaceChildren(I("p", { class: "muted", text: "Не удалось получить список экранов" }));
  }
}, bo = async (e) => {
  if (!l) return;
  let [t, n] = c("screen-q").value.split("-").map(Number), r = ta === "win32" && (c("screen-audio").checked || !he.getScreenSources);
  try {
    e && await he.selectScreenSource(e, r);
    let a = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: Math.round(t * 16 / 9) }, height: { ideal: t }, frameRate: { ideal: n, max: n } }, audio: r });
    if (!l) {
      a.getTracks().forEach((s) => s.stop());
      return;
    }
    let i = a.getVideoTracks()[0];
    i.contentHint = n >= 60 ? "motion" : "detail", i.addEventListener("ended", ar), l.screenStream = a, l.room.addStream(a, { metadata: { kind: "screen" } }), wa(), xt(), Je(), xe("self:screen"), st();
  } catch (a) {
    a.name !== "NotAllowedError" && H("Не удалось начать показ экрана: " + a.message, "bad");
  }
}, ar = () => {
  vo(), l?.screenStream && (l.room.removeStream(l.screenStream), l.screenStream.getTracks().forEach((e) => e.stop()), l.screenStream = null, Tn("self:screen"), xt(), Je(), st());
};
c("btn-screen").addEventListener("click", hu);
var We = /* @__PURE__ */ new Map(), yu = (e) => {
  let t = e.endsWith(":screen"), n = t ? e.slice(0, -7) : e;
  if (n === "self") return { label: v.name + (t ? " — экран" : ""), profile: at(), stream: t ? l.screenStream : l.camStream, micOff: !l.sendTrack || l.micMuted || l.deafened, deaf: l.deafened, self: true, isScreen: t };
  let r = l.peers.get(n);
  return r ? { label: r.name + (t ? " — экран" : ""), profile: r, stream: t ? r.screen : r.cam, micOff: !r.state.mic, deaf: r.state.deaf, peer: r, isScreen: t } : null;
}, xe = (e) => {
  if (!l) return;
  let t = yu(e);
  if (!t) return;
  let n = We.get(e);
  if (!n) {
    let a = I("video", { autoplay: true, playsinline: true });
    a.muted = true;
    let i = I("span", { class: "nm" }), s = ne("mic-off"), m = ne("head-off"), u = I("span", { class: "chip-sm ping hidden" }), f = I("span", { class: "chip-sm vol-tag hidden" }), h = I("div", { class: "tr" }, f, u), y = I("div", { class: `tile${t.isScreen ? " screen" : ""}`, dataset: { key: e } }), k = I("div", { class: "tile-av" }), D = e.replace(/:screen$/, "");
    t.self || h.append(I("button", { class: "tile-btn", title: "Громкость", onclick: (w) => {
      w.stopPropagation(), sr(D, w.clientX, w.clientY);
    } }, ne("vol", "sm"))), h.append(I("button", { class: "tile-btn", title: "Во весь экран", onclick: (w) => {
      w.stopPropagation(), y.requestFullscreen?.();
    } }, ne("max", "sm"))), y.append(k, a, h, I("div", { class: "label" }, s, m, i)), y.addEventListener("click", () => ir(l.focusKey === e ? null : e)), y.addEventListener("dblclick", () => y.requestFullscreen?.()), y.addEventListener("contextmenu", (w) => {
      w.preventDefault(), t.self || sr(D, w.clientX, w.clientY);
    }), n = { root: y, video: a, nameEl: i, micIc: s, deafIc: m, av: k, ping: u, volTag: f }, We.set(e, n), c("grid").append(y);
  }
  n.nameEl.textContent = t.label, n.micIc.classList.toggle("hidden", !t.micOff || t.isScreen || t.deaf), n.deafIc.classList.toggle("hidden", !t.deaf || t.isScreen), n.root.style.setProperty("--c", hr(t.profile.color) ? t.profile.color : "#7c5cff"), n.av.replaceChildren(Te(t.profile, "xl"));
  let r = !!(t.stream && t.stream.getVideoTracks().length);
  if (n.video.srcObject !== (r ? t.stream : null) && (n.video.srcObject = r ? t.stream : null, r && n.video.play().catch(() => {
  })), n.video.classList.toggle("hidden", !r), n.av.classList.toggle("hidden", r), n.video.classList.toggle("mirror", !!(t.self && !t.isScreen && v.mirror)), t.peer && !t.isScreen) {
    let a = tr(t.peer);
    n.volTag.textContent = t.peer.muted ? "заглушен" : `${Math.round(a * 100)}%`, n.volTag.classList.toggle("hidden", !t.peer.muted && Math.abs(a - 1) < 0.01);
  }
}, Tn = (e) => {
  let t = We.get(e);
  t && (t.video.srcObject = null, t.root.remove(), We.delete(e), l?.focusKey === e && ir(null));
}, ir = (e) => {
  if (l) {
    l.focusKey = e && We.has(e) ? e : null;
    for (let [t, n] of We) n.root.classList.toggle("focused", t === l.focusKey);
    c("grid").classList.toggle("focus", !!l.focusKey);
  }
}, st = () => {
  if (!l) return;
  for (let [r, a] of l.peers) xe(r), a.screen && xe(`${r}:screen`);
  let e = We.size, t = zt() ? e <= 2 ? 1 : 2 : e <= 1 ? 1 : e <= 4 ? 2 : e <= 9 ? 3 : 4;
  c("grid").style.setProperty("--cols", t);
  let n = l.peers.size === 0;
  c("waiting").classList.toggle("hidden", !n), c("grid").classList.toggle("hidden", n);
  if (n) {
    c("waiting-avatar").replaceChildren(Te(at(), "xl"));
    const code = c("waiting-code");
    code.classList.toggle("hidden", !!l.record.ephemeral);
    if (!l.record.ephemeral) code.replaceChildren(I("span", { text: l.code }), ne("copy", "sm"));
    Fo();
    wo();
  }
  c("people-count").textContent = l.peers.size + 1, l.focusKey && !We.has(l.focusKey) && ir(null);
}, wo = () => {
  if (!l) return;
  let e = c("quick-invite");
  if (l.record.ephemeral) {
    e.replaceChildren();
    return;
  }
  const room = l;
  const currentPeers = new Set([...room.peers.values()].map(peer => peer.pub));
  const friends = W.list().filter(friend => !currentPeers.has(friend.pub) && W.canInvite(friend.pub));
  e.replaceChildren(...friends.slice(0, 8).map(friend => {
    const sent = room.invited.has(friend.pub);
    const pending = room.invitePending.has(friend.pub);
    const label = sent ? `${friend.name} — позван(а)` : pending ? "Отправляем…" : `Позвать ${friend.name}`;
    return I("button", { class: sent ? "qi sent" : "qi", disabled: sent || pending, onclick: () => pa(friend.pub) }, Te(friend, "sm"), label);
  }));
};
c("waiting-code").addEventListener("click", () => l && !l.record.ephemeral && dt(fa(l.record), "Приглашение скопировано — отправь друзьям")), c("copy-invite").addEventListener("click", () => l && !l.record.ephemeral && dt(fa(l.record), "Приглашение скопировано — отправь друзьям"));
c("waiting-network").addEventListener("click", () => ur("network"));
var ko = { verified: ["verified", "ПРОВЕРЕН"], known: ["known", "ЗНАКОМЫЙ"], new: ["new", "НОВЫЙ"], bad: ["bad", "НЕ ПОДТВЕРЖДЁН"], pending: ["new", "…"] }, Jt = /* @__PURE__ */ new Map(), Ae = () => {
  if (!l || V.type !== "room") return;
  let e = l.record;
  c("room-icon").replaceChildren(Te(Bs(e), "lg")), c("room-name").textContent = e.name, c("room-sub").textContent = e.ephemeral ? "личный звонок · E2E" : "комната · E2E", c("copy-invite").classList.toggle("hidden", !!e.ephemeral);
  let t = c("people");
  t.replaceChildren(), Jt.clear();
  let n = at(), r = I("div", { class: "person" }, I("div", { class: "av-wrap" }, Te(n, "md")), I("div", { class: "p-main" }, I("div", { class: "p-name", text: n.name }), I("div", { class: "p-sub", text: "это ты" })), I("div", { class: "p-icons" }, l.deafened ? ne("head-off") : l.micMuted || !l.sendTrack ? ne("mic-off") : null));
  Jt.set("self", { node: r }), t.append(r);
  for (let a of l.peers.values()) {
    if (a.reserve) {
      const detail = a.reserveVoice ? "Голос и чат · резервное соединение" : "На связи в чате";
      const row = I("div", { class: "person" }, I("div", { class: "av-wrap" }, Te(a, "md")),
        I("div", { class: "p-main" }, I("div", { class: "p-name", text: a.name }), I("div", { class: "p-sub", text: detail })));
      if (a.reserveVoice) row.append(I("button", { class: "icon-btn", title: "Громкость", onclick: ev => sr(a.id, ev.clientX, ev.clientY) }, ne("vol", "sm")));
      if (!W.isFriend(a.pub)) row.append(I("button", { class: "icon-btn accent", title: "Добавить в друзья", onclick: () => xo(a) }, ne("user-plus", "sm")));
      Jt.set(a.id, { node: row });
      t.append(row);
      continue;
    }
    let [i, s] = ko[a.trust] || ko.pending, m = a.trust === "known" && W.isFriend(a.pub) ? "ДРУГ" : s, u = I("div", { class: "p-sub" }), f = a.pub && a.trust !== "bad" && !W.isFriend(a.pub), h = I("div", { class: "person", onclick: (y) => sr(a.id, y.clientX, y.clientY), oncontextmenu: (y) => {
      y.preventDefault(), Zn(y.clientX, y.clientY, [{ label: "Громкость", icon: "vol", fn: () => sr(a.id, y.clientX, y.clientY) }, { label: a.muted ? "Включить звук" : "Заглушить для себя", icon: a.muted ? "vol" : "head-off", fn: () => Io(a.id) }, { label: "Код безопасности", icon: "shield", fn: () => Eo(a.id) }, ...f ? [{ label: "Добавить в друзья", icon: "user-plus", fn: () => xo(a) }] : []]);
    } }, I("div", { class: "av-wrap" }, Te(a, "md")), I("div", { class: "p-main" }, I("div", { class: "p-name", text: a.name }), u), I("div", { class: "p-icons" }, a.muted ? ne("vol") : null, a.state.deaf ? ne("head-off") : a.state.mic ? null : ne("mic-off")), f ? I("button", { class: "icon-btn accent", title: "Добавить в друзья", onclick: (y) => {
      y.stopPropagation(), xo(a);
    } }, ne("user-plus", "sm")) : null, I("button", { class: `trust ${i}`, text: m, title: "Код безопасности", onclick: (y) => {
      y.stopPropagation(), Eo(a.id);
    } }));
    Jt.set(a.id, { node: h, sub: u }), To(a), t.append(h);
  }
}, xo = async (e) => {
  try {
    await W.addByCode(await Zt(e.pub)), H(`Заявка отправлена: ${e.name}`, "ok");
  } catch (t) {
    H(t.message, "bad");
  }
};
c("room-icon").addEventListener("click", () => l && !l.record.ephemeral && oo(l.record)), c("room-name").addEventListener("click", () => l && !l.record.ephemeral && so(l.record));
var So = (e) => e < 80 ? "good" : e < 180 ? "mid" : "bad", To = (e) => {
  let t = Jt.get(e.id), n = e.stats;
  if (t?.sub) {
    let a = [];
    if (n?.rtt != null) {
      let i = Math.round(n.rtt * 1e3);
      a.push(I("span", { class: `ping ${So(i)}`, text: `${i} мс` })), a.push(I("span", { text: n.relayed ? "TURN" : "P2P" })), n.loss > 0.02 && a.push(I("span", { class: "ping bad", text: `−${(n.loss * 100).toFixed(0)}%` }));
    } else a.push(I("span", { text: "соединение…" }));
    t.sub.replaceChildren(...a);
  }
  let r = We.get(e.id);
  if (r && n?.rtt != null) {
    let a = Math.round(n.rtt * 1e3);
    r.ping.textContent = `${a} мс`, r.ping.className = `chip-sm ping ${So(a)}`;
  }
}, ot = null, sr = (e, t, n) => {
  let r = l?.peers.get(e);
  if (!r) return;
  ot = e, c("vol-pop-head").replaceChildren(Te(r, "sm"), I("span", { text: r.name }));
  let a = Math.round(tr(r) * 100);
  c("vol-pop-range").value = a, Yn(c("vol-pop-range")), c("vol-pop-v").textContent = `${a}%`, c("vol-pop-mute").textContent = r.muted ? "Включить" : "Заглушить";
  let i = c("vol-pop");
  i.classList.remove("hidden");
  let s = i.getBoundingClientRect();
  i.style.left = `${Math.min(t, innerWidth - s.width - 10)}px`, i.style.top = `${Math.min(n, innerHeight - s.height - 10)}px`;
}, or = () => {
  c("vol-pop").classList.add("hidden"), ot = null;
}, Po = (e, t) => {
  let n = l?.peers.get(e);
  n && (v.volumes[po(n)] = t, ce(), K.setPeerVolume(e, t), xe(e));
}, Io = (e) => {
  let t = l?.peers.get(e);
  t && (t.muted = !t.muted, K.setPeerMuted(e, t.muted), xe(e), Ae());
};
c("vol-pop-range").addEventListener("input", (e) => {
  let t = Number(e.target.value);
  c("vol-pop-v").textContent = `${t}%`, ot && Po(ot, t / 100);
}), c("vol-pop-reset").addEventListener("click", () => {
  ot && (c("vol-pop-range").value = 100, Yn(c("vol-pop-range")), c("vol-pop-v").textContent = "100%", Po(ot, 1));
}), c("vol-pop-mute").addEventListener("click", () => {
  ot && (Io(ot), c("vol-pop-mute").textContent = l.peers.get(ot)?.muted ? "Включить" : "Заглушить");
}), document.addEventListener("mousedown", (e) => {
  let t = c("vol-pop");
  !t.classList.contains("hidden") && !t.contains(e.target) && or();
});
var lt = null, Lo = async (e, t, n) => {
  let r = Xr(n);
  if (!t || !r.local || !r.remote) {
    H("Собеседник ещё не подключился полностью");
    return;
  }
  lt = t;
  let a = await ol(Ee().pub, t, r.local, r.remote);
  c("v-name").textContent = e, c("v-words").textContent = a.words, c("v-digits").textContent = a.digits, c("v-id").textContent = await Zt(t), At("verify-modal");
}, Eo = (e) => {
  let t = l?.peers.get(e);
  t && Lo(t.name, t.pub, l.room.getPeers()[e]);
}, vu = (e) => {
  let t = W.get(e), n = W.connection(e);
  if (!n) {
    H("Для сверки кода дождись прямого соединения с другом.", "info");
    return;
  }
  Lo(t.name, e, n);
};
c("v-ok").addEventListener("click", () => {
  if (lt) {
    if (tt[lt] = { ...tt[lt] || { name: "" }, verified: true }, ea(), l) for (let e of l.peers.values()) e.pub === lt && e.trust !== "bad" && (e.trust = "verified");
    H("Отмечен как проверенный", "ok"), Ae();
  }
  je("verify-modal");
}), c("v-bad").addEventListener("click", () => {
  if (lt && tt[lt] && (tt[lt].verified = false, ea()), l) for (let e of l.peers.values()) e.pub === lt && (e.trust = "bad");
  Ae(), je("verify-modal"), H("Коды не совпали — возможен перехват. Выйди и создай новую комнату, код передай другим способом.", "bad", 1e4);
});
var bu = ["text", "file", "voice", "circle"], lr = (e) => ({ id: e.id, ts: e.signedTs ?? e.ts, kind: e.kind, text: e.text, file: e.file, reply: e.reply || null, name: e.name, color: e.color, pub: e.pub, sig: e.sig }), Do = (e) => JSON.stringify(["pulse-msg-v2", e.id, e.signedTs ?? e.ts, e.kind, e.text || "", e.file ? [e.file.name, e.file.size, e.file.type, e.file.dur ?? null] : null, e.name, e.color, e.pub, e.reply?.id ?? null]), wu = (e) => {
  let t = {};
  if (!e || typeof e != "object") return t;
  for (let n of qt) Array.isArray(e[n]) && (t[n] = e[n].filter((r) => typeof r == "string").slice(0, 50));
  return t;
}, xa = (e) => {
  if (!e || typeof e != "object" || !bu.includes(e.kind) || typeof e.id != "string" || !/^[0-9a-f]{8,40}$/.test(e.id) || typeof e.ts != "number" || !isFinite(e.ts)) return null;
  // Keep the signed time for verification and sync while limiting local display time.
  let t = { id: e.id, ts: Math.min(e.ts, Gn() + 6e4), signedTs: e.ts, kind: e.kind, text: typeof e.text == "string" ? e.text.slice(0, 4e3) : "", name: ct(e.name) || "Без имени", color: hr(e.color) ? e.color : "#7c5cff", pub: typeof e.pub == "string" ? e.pub.slice(0, 200) : null, sig: typeof e.sig == "string" ? e.sig.slice(0, 300) : null, reply: Ds(e.reply) };
  return t.kind !== "text" && (t.file = Es(e.file, t.kind), !t.file) || t.kind === "text" && !t.text.trim() ? null : t;
}, Mo = async (e) => !!(e.pub && e.sig && await al(e.pub, e.sig, Do(e))), Ao = async (e) => {
  let t = { id: gr(), ts: Gn(), text: "", name: v.name, color: v.color, pub: Ee().pub, reply: null, ...e };
  return t.sig = await rl(Do(t)), t.mine = true, t.reactions = {}, t;
}, ku = (e) => e.mine ? at() : { name: e.name, color: e.color, avatar: na.get(e.pub)?.avatar || null }, Sa = /* @__PURE__ */ new Map(), xu = { get myKey() {
  return Ee()?.pub;
}, authorOf: (e) => e.pub || e.name, profileOf: ku, status: () => null, getUrl: (e) => _e.url(e.id), uploadText: (e) => e.mine && e.upload != null && e.upload < 1 ? `отправка ${Math.round(e.upload * 100)}%` : "", saveLink: Fs, openExternal: he.openExternal, reactorsText: (e) => e.map((t) => t === Ee()?.pub ? "Ты" : na.get(t)?.name || tt[t]?.name || "кто-то").join(", "), onAction: (e, t, n) => Ro(e, t, n) }, Ro = (e, t, n) => {
  l && (e === "react" ? $o(t, n) : e === "reply" ? cr.setReply({ id: t.id, name: t.name, text: yn(t) }) : e === "jump" ? Ns(c("messages"), n) : e === "lightbox" ? qs(n) : e === "menu" && Vs(n, t, { onReact: (r) => $o(t, r), onReply: () => Ro("reply", t), deleteLabel: t.mine ? "Удалить у всех" : "Скрыть у себя", onDelete: () => {
    t.mine && l.A?.del.send({ id: t.id }).catch(() => {
    }), Bo(t.id);
  } }));
}, $o = (e, t) => {
  if (!qt.includes(t)) return;
  let n = Ee().pub, r = !((e.reactions ||= {})[t] || []).includes(n);
  Co(e, t, n, r), l.A?.react.send({ id: e.id, emoji: t, on: r }).catch(() => {
  });
}, Co = (e, t, n, r) => {
  e.reactions ||= {};
  let a = e.reactions[t] ||= [], i = a.includes(n);
  r && !i && a.push(n), !r && i && a.splice(a.indexOf(n), 1), a.length || delete e.reactions[t], In(), Rt();
}, Bo = (e) => {
  if (!l) return;
  let t = l.messages.findIndex((n) => n.id === e);
  t < 0 || (l.messages.splice(t, 1), l.msgIds.delete(e), _e.del(e), In(), Rt());
}, Ta = false, Pa = false, Rt = (e = false) => {
  Pa ||= e, !Ta && (Ta = true, requestAnimationFrame(() => {
    Ta = false, l && (_s(c("messages"), l.messages, xu, Sa, { scroll: Pa }), Pa = false);
  }));
}, Su = async (e, t) => {
  const room = l;
  if (!room) return;
  const n = await Ao({ kind: "text", text: e, reply: t });
  if (l !== room) return;
  Pn(n);
  const wire = lr(n);
  room.A?.chat.send(wire).catch(() => {});
  if (room.links?.members().size && !await room.links.sendText(wire) && l === room)
    H("Не удалось подтвердить отправку через резервное соединение", "bad");
}, Oo = async (e, t) => {
  if (!l?.A) return;
  let n = await Ao(e);
  if (!l || (await _e.put(n.id, t, v.saveHistory), Pn(n), await l.A.chat.send(lr(n)).catch(() => {
  }), !Object.keys(l?.room?.getPeers() || {}).length)) return;
  let r = await t.arrayBuffer(), a = /* @__PURE__ */ new Map();
  l.A.file.send(r, { metadata: { id: n.id }, onProgress: (i, { peerId: s }) => {
    a.set(s, i), n.upload = [...a.values()].reduce((m, u) => m + u, 0) / Math.max(1, l?.peers.size || 1), n.upload >= 1 && delete n.upload, Rt();
  } }).catch((i) => H(`Не удалось отправить: ${i.message}`, "bad"));
}, Tu = 500 * 1024 * 1024, jo = async (e, t = null) => {
  for (let n of e) {
    if (n.size > Tu) {
      H(`«${n.name}» больше 500 МБ`, "bad");
      continue;
    }
    await Oo({ kind: "file", file: eo(n), reply: t }, n), t = null;
  }
}, Pu = async (e, t) => {
  if (!l) return;
  let n = l, r = xa(e);
  if (!r || n.msgIds.has(r.id)) return;
  let a = n.peers.get(t);
  a?.pub && r.pub !== a.pub || !await Mo(r) || l !== n || n.msgIds.has(r.id) || (a && (a.typingUntil = 0), r.reactions = {}, r.kind !== "text" && (r.progress = 0), Pn(r), Ea(), v.sounds && K.beep("message"), document.hasFocus() || he.notify(r.name, yn(r)), (V.type !== "room" || c("view-room").classList.contains("chat-closed")) && Da(true));
}, Iu = async (e) => {
  if (!l || !Array.isArray(e)) return;
  let t = l, n = 0, r = Ee().pub;
  for (let a of e.slice(-200)) {
    let i = xa(a);
    if (!(!i || t.msgIds.has(i.id)) && await Mo(i)) {
      if (l !== t) return;
      if (t.msgIds.has(i.id)) continue;
      i.mine = i.pub === r, i.synced = true, i.reactions = {}, t.messages.push(i), t.msgIds.add(i.id), n++;
    }
  }
  n && (t.messages.sort((a, i) => a.ts - i.ts), Rt(true), In());
}, Lu = async (e, t) => {
  if (!l || !t || typeof t.id != "string") return;
  let n = l.messages.find((r) => r.id === t.id && r.file && !r.mine);
  !n || n.progress == null || (await _e.put(n.id, new Blob([e], { type: n.file.type }), v.saveHistory), delete n.progress, Rt());
}, Eu = (e, t) => {
  let n = l?.peers.get(t);
  if (!n?.pub || !e || typeof e.id != "string" || !qt.includes(e.emoji)) return;
  let r = l.messages.find((a) => a.id === e.id);
  r && Co(r, e.emoji, n.pub, !!e.on);
}, Du = (e, t) => {
  let n = l?.peers.get(t);
  if (!n?.pub || typeof e?.id != "string") return;
  let r = l.messages.find((a) => a.id === e.id);
  r && r.pub === n.pub && Bo(r.id);
}, Ia = (e) => {
  l && Pn({ id: gr(), ts: Date.now(), kind: "system", text: e }, { save: false });
}, Pn = (e, { save: t = true } = {}) => {
  !l || l.msgIds.has(e.id) || (e.mine === void 0 && (e.mine = !!(e.pub && e.pub === Ee()?.pub)), l.messages.push(e), l.msgIds.add(e.id), Rt(e.mine), t && In());
}, Ho = null, In = () => {
  if (!l?.chatKey || !v.saveHistory) return;
  clearTimeout(Ho);
  let e = l;
  Ho = setTimeout(() => {
    pe.set(e.chatKey, e.messages.filter((t) => t.kind !== "system" && t.sig).slice(-500).map((t) => ({ ...lr(t), reactions: t.reactions || {} })));
  }, 500);
}, cr = Xs({ composer: c("room-composer"), input: c("msg-input"), sendBtn: c("send"), attachBtn: c("attach"), fileInput: c("file-input"), voiceBtn: c("room-voice"), circleBtn: c("room-circle"), replyBar: c("room-reply"), onText: Su, onFiles: jo, onMedia: (e, t) => Oo({ kind: e.kind, file: zs(e), reply: t }, e.blob), onTyping: () => {
  l?.A && Date.now() - l.lastTypingSent > 2500 && (l.lastTypingSent = Date.now(), l.A.typing.send(1).catch(() => {
  }));
} }), La = () => V.type === "room" && l ? "room" : V.type === "dm" ? "dm" : null, dr = 0;
window.addEventListener("dragenter", (e) => {
  !La() || !e.dataTransfer?.types.includes("Files") || (dr++, c("drop-overlay").classList.remove("hidden"));
}), window.addEventListener("dragleave", () => {
  --dr <= 0 && (dr = 0, c("drop-overlay").classList.add("hidden"));
}), window.addEventListener("dragover", (e) => e.preventDefault()), window.addEventListener("drop", (e) => {
  e.preventDefault(), dr = 0, c("drop-overlay").classList.add("hidden");
  let t = [...e.dataTransfer?.files || []];
  t.length && (La() === "room" ? jo(t) : La() === "dm" && to(t));
});
var Ea = () => {
  if (!l) return;
  let e = Date.now(), t = [...l.peers.values()].filter((n) => n.typingUntil > e).map((n) => n.name);
  c("typing").textContent = t.length ? `${t.join(", ")} ${t.length > 1 ? "печатают" : "печатает"}` : "";
}, Da = (e) => c("unread-dot").classList.toggle("hidden", !e), Ma = (e) => {
  zt() || (v.chatOpen = e, ce()), c("view-room").classList.toggle("chat-closed", !e), e && (Da(false), c("messages").scrollTop = c("messages").scrollHeight);
};
c("btn-side").addEventListener("click", () => Ma(c("view-room").classList.contains("chat-closed"))), c("drawer-close").addEventListener("click", () => Ma(false));
var Uo = (e) => Math.max(0, Math.min(1, (e - 8e-3) * 9)), Mu = () => {
  if (!l) return;
  let e = K.micLevel(), t = Date.now();
  if (v.mode === "vad") {
    let r = e * 100 > v.vad;
    r && (l.lastVoice = t);
    let a = r || t - l.lastVoice < 400;
    a !== l.vadOpen && (l.vadOpen = a, Ge());
  }
  let n = !!l.sendTrack?.enabled;
  c("mic-meter-bar").style.height = `${Math.min(100, e * 400)}%`, c("mic-meter-bar").style.opacity = n ? 1 : 0.3, l.selfLvl = Math.max(n ? Uo(e) : 0, l.selfLvl * 0.82), qo("self", l.selfLvl);
  for (let [r, a] of l.peers) {
    let i = a.muted ? 0 : Uo(K.peerLevel(r));
    a.lvl = Math.max(i, a.lvl * 0.82), qo(r, a.lvl);
  }
}, qo = (e, t) => {
  let n = t > 0.12, r = We.get(e);
  r && r.speaking !== n && (r.speaking = n, r.root.classList.toggle("speaking", n));
  let a = Jt.get(e);
  a && a.speaking !== n && (a.speaking = n, a.node.classList.toggle("speaking", n));
}, Au = async () => {
  if (!l?.room) return;
  let e = l, t = e.room.getPeers();
  for (let [r, a] of e.peers) try {
    if (a.stats = await Ad(a.voiceConnection || t[r]), l !== e) return;
    To(a);
  } catch {
  }
  let n = [...e.peers.values()].map((r) => r.stats?.rtt).filter((r) => r != null);
  c("cb-sub").textContent = e.peers.size ? `${e.peers.size + 1} в комнате${n.length ? ` · ${Math.round(Math.max(...n) * 1e3)} мс` : ""}` : "ждём собеседников";
}, Fo = () => {
  if (!l) return;
  const { open, total } = Yr();
  const network = c("net-status");
  network.className = `tag ${open > 0 ? "ok" : "bad"}`;
  c("net-text").textContent = open > 0 ? `Узлы ${open}/${total}` : "Узлы недоступны";
  network.title = `Открыто ${open} из ${total} соединений с узлами поиска`;
  if (l.peers.size) return;

  const isCall = l.record.ephemeral;
  let title = isCall ? "Поиск собеседника" : "Поиск участников";
  let detail = isCall ? "" : "Откройте комнату по одному и тому же коду.";
  if (l.peerConnectionError) {
    title = "Подключение к участнику не удалось";
    detail = l.peerConnectionError === "ice"
      ? "Участник ответил, но голосовое соединение не установилось. Для связи между закрытыми сетями можно настроить TURN."
      : "Участник ответил, но соединение не завершилось. Поиск продолжается.";
  } else if (l.waitedForPeers && !open) {
    title = "Узлы поиска недоступны";
    detail = "Проверьте интернет или адреса узлов поиска в настройках сети.";
  } else if (l.waitedForPeers) {
    title = isCall ? "Собеседник пока не подключился" : "Пока в комнате только ты";
    detail = "Pulse продолжает поиск. Для связи участникам нужен общий узел поиска.";
  } else if (!open && !isCall) {
    detail = "Ждём подключения к узлам поиска.";
  }
  if (c("waiting-title").textContent !== title) c("waiting-title").textContent = title;
  if (c("waiting-detail").textContent !== detail) c("waiting-detail").textContent = detail;
  c("waiting-network").classList.toggle("hidden", !l.waitedForPeers && !l.peerConnectionError);
}, zo = () => {
  if (!l) return;
  let e = Math.floor((Date.now() - l.startedAt) / 1e3), t = Math.floor(e / 3600), n = String(Math.floor(e % 3600 / 60)).padStart(2, "0"), r = String(e % 60).padStart(2, "0");
  c("call-timer").textContent = t ? `${t}:${n}:${r}` : `${n}:${r}`;
}, Aa = () => {
  if (!W) return;
  const roomConnections = Yr().open;
  const online = W.list().filter(friend => W.isOnline(friend.pub)).length;
  const directory = Qt.getPool().readableCount();
  const parts = [];
  if (online) parts.push(`Друзей в сети — ${online}`);
  parts.push(directory ? `Каталог — ${directory} узл.` : "Нет связи с каталогом");
  parts.push(roomConnections ? `Комнаты — ${roomConnections} узл.` : "Комнаты подключаются…");
  c("tb-status").textContent = parts.join(" · ");
  if (directory !== lastDirectoryCount) {
    lastDirectoryCount = directory;
    wn();
    if (V.type === "dm") $e();
  }
}, _o = async () => {
  let e = [];
  try {
    e = await navigator.mediaDevices.enumerateDevices();
  } catch {
  }
  let t = (n, r, a) => {
    n.replaceChildren(I("option", { value: "", text: "По умолчанию" })), e.filter((i) => i.kind === r && i.deviceId && i.deviceId !== "default" && i.deviceId !== "communications").forEach((i, s) => n.append(I("option", { value: i.deviceId, text: i.label || `Устройство ${s + 1}` }))), n.value = a, n.value !== a && (n.value = "");
  };
  t(c("s-mic"), "audioinput", v.micId), t(c("s-out"), "audiooutput", v.outId), t(c("s-cam"), "videoinput", v.camId);
};
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  c("settings-modal").classList.contains("hidden") || _o();
});
var Ra = null, Ln = false, No = () => c("s-avatar-preview").replaceChildren(Te(at(), "xl")), ur = async (e = "account") => {
  if (Vo(e), No(), c("s-name").value = v.name, c("s-bio").value = v.bio, c("s-myid").textContent = Ee()?.id || "", Cu(), Gd(c("s-themes")), c("s-lowfps").checked = document.documentElement.classList.contains("lowfps"), c("s-guard").checked = Xe.enabled(), c("s-anim").checked = v.animations, c("s-bgint").value = Math.round(v.bgIntensity * 100), c("s-bgint-v").textContent = `${c("s-bgint").value}%`, c("s-reactive").checked = v.reactive, c("s-wall-dim").value = v.wallDim, c("s-wall-dim-v").textContent = `${v.wallDim}%`, c("s-wall-blur").value = v.wallBlur, c("s-wall-blur-v").textContent = `${v.wallBlur} px`, _t(), c("s-micgain").value = Math.round(v.micGain * 100), c("s-micgain-v").textContent = `${c("s-micgain").value}%`, c("s-master").value = Math.round(v.master * 100), c("s-master-v").textContent = `${c("s-master").value}%`, c("s-vad").value = v.vad, c("s-vad-v").textContent = v.vad, c("s-ptt-key").textContent = ba(v.pttKey), c("s-ns").checked = v.ns, c("s-ec").checked = v.ec, c("s-agc").checked = v.agc, c("s-joinmuted").checked = v.joinMuted, c("s-sounds").checked = v.sounds, c("s-camq").value = v.camQ, c("s-mirror").checked = v.mirror, c("s-lowlat").checked = v.lowLatency, c("s-bitrate").value = String(v.audioBitrate), c("s-turn").value = v.turnUrl, c("s-turn-user").value = v.turnUser, c("s-turn-pass").value = v.turnPass, c("s-relays").value = v.relays.join(`
`), c("s-relays").placeholder = bs.slice(0, 4).join(`
`) + `
…`, c("s-stun").value = v.stun.join(`
`), c("s-stun").placeholder = ws.slice(0, 3).join(`
`) + `
…`, c("s-history").checked = v.saveHistory, c("s-hk-mute").value = v.hkMute, c("s-hk-deaf").value = v.hkDeaf, c("s-tray").checked = v.tray, c("s-autostart").checked = v.autostart, Ko(), At("settings-modal"), await K.resume(), !l && !K.mic && !c("settings-modal").classList.contains("hidden")) {
    Nt = true;
    try {
      await K.startMic(nr());
    } catch {
    }
  }
  if (c("settings-modal").classList.contains("hidden")) return;
  _o(), clearInterval(Ra), Ra = setInterval(() => {
    c("s-meter").style.width = `${Math.min(100, K.micLevel() * 400)}%`, c("s-vad-mark").style.left = `${Math.min(100, v.vad * 4)}%`;
  }, 50);
}, Ru = () => {
  clearInterval(Ra), Ln && Zo(), Nt && !l && (K.stopMic(), Nt = false);
}, Vo = (e) => {
  document.querySelectorAll(".snav").forEach((t) => t.classList.toggle("active", t.dataset.sec === e)), document.querySelectorAll(".ssec").forEach((t) => t.classList.toggle("hidden", t.dataset.sec !== e)), ra();
};
document.querySelectorAll(".snav").forEach((e) => e.addEventListener("click", () => Vo(e.dataset.sec))), c("btn-settings").addEventListener("click", () => ur("audio"));
var Ko = () => {
  document.querySelectorAll("#s-mode button").forEach((e) => e.classList.toggle("active", e.dataset.v === v.mode)), c("s-vad-wrap").classList.toggle("hidden", v.mode !== "vad"), c("s-ptt-wrap").classList.toggle("hidden", v.mode !== "ptt"), ra();
};
document.querySelectorAll("#s-mode button").forEach((e) => e.addEventListener("click", () => {
  v.mode = e.dataset.v, ce(), Ko(), l && (l.vadOpen = false, l.pttDown = false), Ge(), Je();
}));
var X = (e, t, n) => c(e).addEventListener(t, n), Wo = null, mr = () => {
  ce(), Ua(Ye().id, { name: v.name, avatar: v.avatar, color: v.color }), bt(), No(), clearTimeout(Wo), Wo = setTimeout(() => {
    if (W?.broadcastProfile(), l) {
      for (let e of l.peers.keys()) fo(e);
      xe("self"), Ae();
    }
  }, 600);
};
X("s-name", "input", (e) => {
  let t = ct(e.target.value);
  t && (v.name = t, mr());
}), X("s-bio", "input", (e) => {
  v.bio = ja(e.target.value), mr();
}), X("s-avatar", "click", async () => {
  let e = await En();
  if (e) try {
    v.avatar = await vr(e), mr();
  } catch (t) {
    H(t.message, "bad");
  }
}), X("s-avatar-remove", "click", () => {
  v.avatar = null, mr();
}), X("s-delete", "click", async () => {
  await Kt("Точно удалить аккаунт? Ключи, друзья и история исчезнут навсегда.", "Удалить навсегда") && (await kt({ silent: true }), await bl(Ye().id), pr());
}), X("s-guard", "change", (e) => {
  Xe.setEnabled(e.target.checked), V.type === "dm" && $e(), H(e.target.checked ? "Режим защиты включён: мат не отправится, а у других будет скрыт" : "Режим защиты выключен", "ok");
}), X("s-lowfps", "change", (e) => {
  localStorage.setItem("pulse:lowfps", e.target.checked ? "1" : "0"), document.documentElement.classList.toggle("lowfps", e.target.checked), H(e.target.checked ? "Анимации выключены — Pulse почти не грузит видеокарту" : "Анимации включены", "ok");
}), X("s-anim", "change", (e) => {
  v.animations = e.target.checked, ce(), vn();
}), X("s-bgint", "input", (e) => {
  v.bgIntensity = Number(e.target.value) / 100, c("s-bgint-v").textContent = `${e.target.value}%`, ce(), vn();
});
var Go = async () => {
  let e = await En();
  if (e) try {
    let t = await yl(e);
    await _e.del("__wallpaper"), await _e.put("__wallpaper", t, true), v.wallpaper = true, ce(), _t(), H("Фон обновлён", "ok");
  } catch (t) {
    H(t.message, "bad");
  }
};
X("s-wall-pick", "click", Go), X("s-wall-preview", "click", Go), X("s-wall-clear", "click", async () => {
  v.wallpaper = false, ce(), await _e.del("__wallpaper"), _t();
}), X("s-wall-dim", "input", (e) => {
  v.wallDim = Number(e.target.value), c("s-wall-dim-v").textContent = `${v.wallDim}%`, ce(), _t();
}), X("s-wall-blur", "input", (e) => {
  v.wallBlur = Number(e.target.value), c("s-wall-blur-v").textContent = `${v.wallBlur} px`, ce(), _t();
}), X("s-reactive", "change", (e) => {
  v.reactive = e.target.checked, ce(), vn();
}), X("s-mic", "change", (e) => {
  v.micId = e.target.value, ce(), ya();
}), X("s-out", "change", (e) => {
  v.outId = e.target.value, ce(), K.setOutputDevice(v.outId);
}), X("s-cam", "change", (e) => {
  v.camId = e.target.value, ce(), yo();
}), X("s-camq", "change", (e) => {
  v.camQ = e.target.value, ce(), yo();
}), X("s-micgain", "input", (e) => {
  v.micGain = Number(e.target.value) / 100, c("s-micgain-v").textContent = `${e.target.value}%`, K.setMicGain(v.micGain), pu(), ce();
}), X("s-master", "input", (e) => {
  v.master = Number(e.target.value) / 100, c("s-master-v").textContent = `${e.target.value}%`, K.setMasterVolume(v.master), ce();
}), X("s-vad", "input", (e) => {
  v.vad = Number(e.target.value), c("s-vad-v").textContent = v.vad, ce();
});
for (let [e, t] of [["s-ns", "ns"], ["s-ec", "ec"], ["s-agc", "agc"]]) X(e, "change", (n) => {
  v[t] = n.target.checked, ce(), ya();
});
for (let [e, t] of [["s-joinmuted", "joinMuted"], ["s-sounds", "sounds"], ["s-lowlat", "lowLatency"]]) X(e, "change", (n) => {
  v[t] = n.target.checked, ce(), bt();
});
X("s-mirror", "change", (e) => {
  v.mirror = e.target.checked, ce(), l && xe("self");
}), X("s-bitrate", "change", (e) => {
  v.audioBitrate = Number(e.target.value), ce();
});
for (let [e, t] of [["s-turn", "turnUrl"], ["s-turn-user", "turnUser"], ["s-turn-pass", "turnPass"]]) X(e, "change", (n) => {
  v[t] = n.target.value.trim(), ce(), c("s-apply-network").classList.remove("hidden");
});
const voicePreference = c("s-reserve-voice");
c("s-network-report").addEventListener("click", async () => {
  try {
    const report = await networkReport(Qt.getPool().urls, relayUrls(v.relays));
    await dt(JSON.stringify(report, null, 2), "Журнал сети скопирован");
  } catch {
    H("Не удалось скопировать журнал сети.", "bad");
  }
});
voicePreference.checked = v.reserveVoice !== false;
voicePreference.addEventListener("change", () => {
  v.reserveVoice = voicePreference.checked;
  ce();
  if (v.reserveVoice) l?.links?.startVoice().catch(console.warn);
  else l?.links?.stopVoice();
});
var Jo = (e, t) => e.split(/\s+/).map((n) => n.trim()).filter((n) => t.test(n));
X("s-relays", "change", (e) => {
  const addresses = e.target.value.trim().split(/\s+/).filter(Boolean);
  for (const address of addresses) {
    try {
      const url = new URL(address);
      if (!/^wss:\/\//i.test(address) || !url.hostname || url.username || url.password || url.hash) throw new Error();
    } catch {
      e.target.value = v.relays.join("\n");
      H("Адрес релея должен начинаться с wss:// и содержать имя сервера.", "bad");
      return;
    }
  }
  v.relays = rememberRelayUrls(addresses);
  e.target.value = v.relays.join("\n");
  ce();
  c("s-apply-network").classList.remove("hidden");
}), X("s-stun", "change", (e) => {
  v.stun = Jo(e.target.value, /^stuns?:[^\s]+$/i), e.target.value = v.stun.join(`
`), ce(), c("s-apply-network").classList.remove("hidden");
}), X("s-apply-network", "click", async () => {
  if (l && !await Kt("Выйти из текущей комнаты и применить настройки сети?", "Переподключиться")) return;
  if (l) await kt({ silent: true });
  location.reload();
}), X("s-history", "change", (e) => {
  v.saveHistory = e.target.checked, ce(), !v.saveHistory && l?.chatKey ? pe.remove(l.chatKey) : In();
}), X("s-clear-history", "click", async () => {
  await Kt("Удалить историю всех чатов с этого устройства?", "Удалить") && (pe.keys().filter((e) => e.startsWith("chat:") || e.startsWith("dm:")).forEach((e) => pe.remove(e)), await _e.clear(["__wallpaper"]), H("История и вложения удалены", "ok"));
});
var Yo = () => he.setHotkeys({ mute: v.hkMute, deafen: v.hkDeaf });
for (let [e, t] of [["s-hk-mute", "hkMute"], ["s-hk-deaf", "hkDeaf"]]) X(e, "change", (n) => {
  v[t] = n.target.value.trim(), ce(), Yo();
});
var Xo = () => he.setSystem({ tray: v.tray, autostart: v.autostart });
for (let [e, t] of [["s-tray", "tray"], ["s-autostart", "autostart"]]) X(e, "change", (n) => {
  v[t] = n.target.checked, ce(), Xo();
});
X("s-ptt-key", "click", () => {
  let e = c("s-ptt-key");
  e.textContent = "Нажми клавишу…";
  let t = (n) => {
    n.preventDefault(), n.stopPropagation(), n.code !== "Escape" && (v.pttKey = n.code), ce(), e.textContent = ba(v.pttKey), Je(), window.removeEventListener("keydown", t, true);
  };
  window.addEventListener("keydown", t, true);
});
var Zo = () => {
  Ln = !Ln, K.setMonitor(Ln), c("s-monitor").textContent = Ln ? "Хватит" : "Послушать себя";
};
X("s-monitor", "click", Zo);
var pr = async () => {
  if (document.documentElement.hasAttribute("data-locking")) return;
  document.documentElement.setAttribute("data-locking", "");
  document.body.style.visibility = "hidden";
  sessionStorage.setItem("pulse:locked", "1");
  try {
    l?.room?.leave();
    await Qt.goOffline();
  } finally {
    location.reload();
  }
};
X("s-lock", "click", pr), X("s-logout", "click", async () => {
  await Kt("Выйти из аккаунта? При следующем входе понадобится пароль.", "Выйти") && (_a(Ye().id), pr());
}), X("s-remember", "change", async (e) => {
  let t = Ye();
  e.target.checked ? await hl(t.id, t.mk) : _a(t.id), H(e.target.checked ? "Вход запомнен на этом устройстве" : "Теперь при запуске будет нужен пароль", "ok");
}), X("s-autolock", "change", (e) => {
  v.autoLock = Number(e.target.value), ce();
});
var Qo = Date.now();
for (let e of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(e, () => Qo = Date.now(), { passive: true });
setInterval(() => {
  v.autoLock > 0 && !l && !ge && Date.now() - Qo > v.autoLock * 6e4 && pr();
}, 15e3);
var $u = (e, t) => e.addEventListener("input", () => {
  let { score: n, label: r } = Na(e.value);
  t.dataset.score = e.value ? n : "", t.querySelector("b").textContent = e.value ? `Пароль: ${r}` : "";
});
$u(c("s-pw-new"), c("s-pw-meter")), X("s-pw-change", "click", async () => {
  let e = c("s-pw-old").value, t = c("s-pw-new").value;
  if (t.length < 8 || Na(t).score === 0) {
    H("Новый пароль слишком простой (минимум 8 символов)", "bad");
    return;
  }
  if (t !== c("s-pw-new2").value) {
    H("Новые пароли не совпадают", "bad");
    return;
  }
  let n = c("s-pw-change");
  n.disabled = true;
  try {
    await pl(Ye().id, e, t), await Qt.onPasswordChanged(t).catch(() => {
    });
    for (let r of ["s-pw-old", "s-pw-new", "s-pw-new2"]) c(r).value = "";
    H("Пароль изменён", "ok");
  } catch (r) {
    H(r.message === "Неверный пароль" ? "Текущий пароль введён неверно" : r.message, "bad");
  } finally {
    n.disabled = false;
  }
}), X("s-backup", "click", async () => {
  let e = Ye(), t = c("s-backup-pw").value;
  if (!e.keys) {
    H("Ключи этого аккаунта созданы в старой версии и не переносятся. Создай новый аккаунт, чтобы пользоваться им на нескольких устройствах.", "bad", 9e3);
    return;
  }
  let n = c("s-backup");
  n.disabled = true;
  try {
    if (!await za(e.id, t)) {
      H("Неверный пароль", "bad");
      return;
    }
    let r = await wl(e, t, { name: v.name, color: v.color, avatar: v.avatar, theme: v.theme }, pe.dump()), a = `Pulse-${v.name.replace(/[^\p{L}\d_-]+/gu, "_")}.pulse`, i = URL.createObjectURL(new Blob([r], { type: "application/octet-stream" }));
    ve ? await $s(i, a, "application/octet-stream") : I("a", { href: i, download: a }).click(), setTimeout(() => URL.revokeObjectURL(i), 6e4), c("s-backup-pw").value = "", H("Копия сохранена. Храни файл в надёжном месте — с ним и паролем можно войти в аккаунт.", "ok", 7e3);
  } catch (r) {
    H(r.message, "bad");
  } finally {
    n.disabled = false;
  }
});
var Cu = () => {
  let e = Ye();
  c("s-remember").checked = vl(e.id), c("s-autolock").value = String(v.autoLock || 0), c("s-backup-wrap").classList.toggle("legacy", !e.keys);
}, Bu = async () => {
  c("shell").classList.remove("hidden"), W = _d({ settings: v, getProfile: at, events: tu, media: _e, mail: Qt.mail }), bt(), wt(null), Yo(), Xo(), Qt.start({ get settings() {
    return v;
  }, saveSettings: ce, friends: () => W, rooms: { list: () => nt, add: xn, join: Sn, save: rt }, onRoomInvite: tu.onInvite, store: pe, account: Ye, identity: Ee, checkPassword: za, toast: H, el: I, avatar: Te, openModal: At, closeModal: je, rerender: () => {
    wn(), He(), bt(), V.type === "dm" && $e();
  } }).catch((e) => console.warn("PulseNet", e));
  try {
    await W.start();
  } catch (e) {
    console.error(e), H("Не удалось подключиться к сети друзей: " + e.message, "bad");
  }
  Wt(), setInterval(Aa, 3e3), Aa(), he.onOpenChat?.((e) => e && W.get(e) && wt(e));
}, Ou = async () => {
  try {
    let e = await he.info();
    ta = e.platform, c("app-version").textContent = `Pulse ${e.version} · сетевая сборка 2
от exepcstudio · © 2026
Все права защищены`;
  } catch {
  }
  window.addEventListener("pointerdown", () => K.resume(), { once: true }), Ee() || await Sl(), Bu();
};
Ou(), !window.pulse && !ve && (window.__pulse = { audio: K, getCall: () => l, getFriends: () => W });
