import { networkNow } from "./network-time.js";
import { traceNetwork } from "./network-diagnostics.js";
import { v as friendCodeForPub } from "./chunk-7GRP2DEX.js";

var be = typeof globalThis == "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
function Fe(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Y(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("positive integer expected, got " + e);
}
function ae(e, ...r) {
  if (!Fe(e)) throw new Error("Uint8Array expected");
  if (r.length > 0 && !r.includes(e.length)) throw new Error("Uint8Array expected of length " + r + ", got length=" + e.length);
}
function Ie(e) {
  if (typeof e != "function" || typeof e.create != "function") throw new Error("Hash should be wrapped by utils.createHasher");
  Y(e.outputLen), Y(e.blockLen);
}
function qe(e, r = true) {
  if (e.destroyed) throw new Error("Hash instance has been destroyed");
  if (r && e.finished) throw new Error("Hash#digest() has already been called");
}
function Or(e, r) {
  ae(e);
  let n = r.outputLen;
  if (e.length < n) throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Je(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function de(...e) {
  for (let r = 0; r < e.length; r++) e[r].fill(0);
}
function Ke(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function re(e, r) {
  return e << 32 - r | e >>> r;
}
function N(e, r) {
  return e << r | e >>> 32 - r >>> 0;
}
var Ir = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Ar(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Rr(e) {
  for (let r = 0; r < e.length; r++) e[r] = Ar(e[r]);
  return e;
}
var Ot = Ir ? (e) => e : Rr, It = typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Nr = Array.from({ length: 256 }, (e, r) => r.toString(16).padStart(2, "0"));
function ee(e) {
  if (ae(e), It) return e.toHex();
  let r = "";
  for (let n = 0; n < e.length; n++) r += Nr[e[n]];
  return r;
}
var ie = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function At(e) {
  if (e >= ie._0 && e <= ie._9) return e - ie._0;
  if (e >= ie.A && e <= ie.F) return e - (ie.A - 10);
  if (e >= ie.a && e <= ie.f) return e - (ie.a - 10);
}
function he(e) {
  if (typeof e != "string") throw new Error("hex string expected, got " + typeof e);
  if (It) return Uint8Array.fromHex(e);
  let r = e.length, n = r / 2;
  if (r % 2) throw new Error("hex string expected, got unpadded hex of length " + r);
  let t = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    let s = At(e.charCodeAt(o)), a = At(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      let l = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + l + '" at index ' + o);
    }
    t[i] = s * 16 + a;
  }
  return t;
}
var Ur = async () => {
};
async function Rt(e, r, n) {
  let t = Date.now();
  for (let i = 0; i < e; i++) {
    n(i);
    let o = Date.now() - t;
    o >= 0 && o < r || (await Ur(), t += o);
  }
}
function Xe(e) {
  if (typeof e != "string") throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function Ae(e) {
  return typeof e == "string" && (e = Xe(e)), ae(e), e;
}
function Nt(e) {
  return typeof e == "string" && (e = Xe(e)), ae(e), e;
}
function ne(...e) {
  let r = 0;
  for (let t = 0; t < e.length; t++) {
    let i = e[t];
    ae(i), r += i.length;
  }
  let n = new Uint8Array(r);
  for (let t = 0, i = 0; t < e.length; t++) {
    let o = e[t];
    n.set(o, i), i += o.length;
  }
  return n;
}
function Ut(e, r) {
  if (r !== void 0 && {}.toString.call(r) !== "[object Object]") throw new Error("options should be object or undefined");
  return Object.assign(e, r);
}
var Lt = class {
};
function Lr(e) {
  let r = (t) => e().update(Ae(t)).digest(), n = e();
  return r.outputLen = n.outputLen, r.blockLen = n.blockLen, r.create = () => e(), r;
}
function Ee(e = 32) {
  if (be && typeof be.getRandomValues == "function") return be.getRandomValues(new Uint8Array(e));
  if (be && typeof be.randomBytes == "function") return Uint8Array.from(be.randomBytes(e));
  throw new Error("crypto.getRandomValues must be defined");
}
function Cr(e, r, n, t) {
  if (typeof e.setBigUint64 == "function") return e.setBigUint64(r, n, t);
  let i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), l = t ? 4 : 0, f = t ? 0 : 4;
  e.setUint32(r + l, s, t), e.setUint32(r + f, a, t);
}
function Fr(e, r, n) {
  return e & r ^ ~e & n;
}
function qr(e, r, n) {
  return e & r ^ e & n ^ r & n;
}
var Kr = class extends Lt {
  constructor(e, r, n, t) {
    super(), this.finished = false, this.length = 0, this.pos = 0, this.destroyed = false, this.blockLen = e, this.outputLen = r, this.padOffset = n, this.isLE = t, this.buffer = new Uint8Array(e), this.view = Ke(this.buffer);
  }
  update(e) {
    qe(this), e = Ae(e), ae(e);
    let { view: r, buffer: n, blockLen: t } = this, i = e.length;
    for (let o = 0; o < i; ) {
      let s = Math.min(t - this.pos, i - o);
      if (s === t) {
        let a = Ke(e);
        for (; t <= i - o; o += t) this.process(a, o);
        continue;
      }
      n.set(e.subarray(o, o + s), this.pos), this.pos += s, o += s, this.pos === t && (this.process(r, 0), this.pos = 0);
    }
    return this.length += e.length, this.roundClean(), this;
  }
  digestInto(e) {
    qe(this), Or(e, this), this.finished = true;
    let { buffer: r, view: n, blockLen: t, isLE: i } = this, { pos: o } = this;
    r[o++] = 128, de(this.buffer.subarray(o)), this.padOffset > t - o && (this.process(n, 0), o = 0);
    for (let c = o; c < t; c++) r[c] = 0;
    Cr(n, t - 8, BigInt(this.length * 8), i), this.process(n, 0);
    let s = Ke(e), a = this.outputLen;
    if (a % 4) throw new Error("_sha2: outputLen should be aligned to 32bit");
    let l = a / 4, f = this.get();
    if (l > f.length) throw new Error("_sha2: outputLen bigger than state");
    for (let c = 0; c < l; c++) s.setUint32(4 * c, f[c], i);
  }
  digest() {
    let { buffer: e, outputLen: r } = this;
    this.digestInto(e);
    let n = e.slice(0, r);
    return this.destroy(), n;
  }
  _cloneInto(e) {
    e || (e = new this.constructor()), e.set(...this.get());
    let { blockLen: r, buffer: n, length: t, finished: i, destroyed: o, pos: s } = this;
    return e.destroyed = o, e.finished = i, e.length = t, e.pos = s, t % r && e.buffer.set(n), e;
  }
  clone() {
    return this._cloneInto();
  }
}, ue = Uint32Array.from([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]), Tr = Uint32Array.from([1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298]), le = new Uint32Array(64), Vr = class extends Kr {
  constructor(e = 32) {
    super(64, e, 8, false), this.A = ue[0] | 0, this.B = ue[1] | 0, this.C = ue[2] | 0, this.D = ue[3] | 0, this.E = ue[4] | 0, this.F = ue[5] | 0, this.G = ue[6] | 0, this.H = ue[7] | 0;
  }
  get() {
    let { A: e, B: r, C: n, D: t, E: i, F: o, G: s, H: a } = this;
    return [e, r, n, t, i, o, s, a];
  }
  set(e, r, n, t, i, o, s, a) {
    this.A = e | 0, this.B = r | 0, this.C = n | 0, this.D = t | 0, this.E = i | 0, this.F = o | 0, this.G = s | 0, this.H = a | 0;
  }
  process(e, r) {
    for (let c = 0; c < 16; c++, r += 4) le[c] = e.getUint32(r, false);
    for (let c = 16; c < 64; c++) {
      let g = le[c - 15], u = le[c - 2], y = re(g, 7) ^ re(g, 18) ^ g >>> 3, E = re(u, 17) ^ re(u, 19) ^ u >>> 10;
      le[c] = E + le[c - 7] + y + le[c - 16] | 0;
    }
    let { A: n, B: t, C: i, D: o, E: s, F: a, G: l, H: f } = this;
    for (let c = 0; c < 64; c++) {
      let g = re(s, 6) ^ re(s, 11) ^ re(s, 25), u = f + g + Fr(s, a, l) + Tr[c] + le[c] | 0, y = (re(n, 2) ^ re(n, 13) ^ re(n, 22)) + qr(n, t, i) | 0;
      f = l, l = a, a = s, s = o + u | 0, o = i, i = t, t = n, n = u + y | 0;
    }
    n = n + this.A | 0, t = t + this.B | 0, i = i + this.C | 0, o = o + this.D | 0, s = s + this.E | 0, a = a + this.F | 0, l = l + this.G | 0, f = f + this.H | 0, this.set(n, t, i, o, s, a, l, f);
  }
  roundClean() {
    de(le);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), de(this.buffer);
  }
}, ve = Lr(() => new Vr()), Ct = class extends Lt {
  constructor(e, r) {
    super(), this.finished = false, this.destroyed = false, Ie(e);
    let n = Ae(r);
    if (this.iHash = e.create(), typeof this.iHash.update != "function") throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    let t = this.blockLen, i = new Uint8Array(t);
    i.set(n.length > t ? e.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++) i[o] ^= 54;
    this.iHash.update(i), this.oHash = e.create();
    for (let o = 0; o < i.length; o++) i[o] ^= 106;
    this.oHash.update(i), de(i);
  }
  update(e) {
    return qe(this), this.iHash.update(e), this;
  }
  digestInto(e) {
    qe(this), ae(e, this.outputLen), this.finished = true, this.iHash.digestInto(e), this.oHash.update(e), this.oHash.digestInto(e), this.destroy();
  }
  digest() {
    let e = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(e), e;
  }
  _cloneInto(e) {
    e || (e = Object.create(Object.getPrototypeOf(this), {}));
    let { oHash: r, iHash: n, finished: t, destroyed: i, blockLen: o, outputLen: s } = this;
    return e = e, e.finished = t, e.destroyed = i, e.blockLen = o, e.outputLen = s, e.oHash = r._cloneInto(e.oHash), e.iHash = n._cloneInto(e.iHash), e;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true, this.oHash.destroy(), this.iHash.destroy();
  }
}, Re = (e, r, n) => new Ct(e, r).update(n).digest();
Re.create = (e, r) => new Ct(e, r);
var We = BigInt(0), Qe = BigInt(1);
function Te(e, r = "") {
  if (typeof e != "boolean") {
    let n = r && `"${r}"`;
    throw new Error(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function pe(e, r, n = "") {
  let t = Fe(e), i = e?.length, o = r !== void 0;
  if (!t || o && i !== r) {
    let s = n && `"${n}" `, a = o ? ` of length ${r}` : "", l = t ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + l);
  }
  return e;
}
function Ve(e) {
  let r = e.toString(16);
  return r.length & 1 ? "0" + r : r;
}
function Ft(e) {
  if (typeof e != "string") throw new Error("hex string expected, got " + typeof e);
  return e === "" ? We : BigInt("0x" + e);
}
function Be(e) {
  return Ft(ee(e));
}
function qt(e) {
  return ae(e), Ft(ee(Uint8Array.from(e).reverse()));
}
function Pe(e, r) {
  return he(e.toString(16).padStart(r * 2, "0"));
}
function Kt(e, r) {
  return Pe(e, r).reverse();
}
function V(e, r, n) {
  let t;
  if (typeof r == "string") try {
    t = he(r);
  } catch (o) {
    throw new Error(e + " must be hex string or Uint8Array, cause: " + o);
  }
  else if (Fe(r)) t = Uint8Array.from(r);
  else throw new Error(e + " must be hex string or Uint8Array");
  let i = t.length;
  if (typeof n == "number" && i !== n) throw new Error(e + " of length " + n + " expected, got " + i);
  return t;
}
var et = (e) => typeof e == "bigint" && We <= e;
function tt(e, r, n) {
  return et(e) && et(r) && et(n) && r <= e && e < n;
}
function Pr(e, r, n, t) {
  if (!tt(r, n, t)) throw new Error("expected valid " + e + ": " + n + " <= n < " + t + ", got " + r);
}
function Tt(e) {
  let r;
  for (r = 0; e > We; e >>= Qe, r += 1) ;
  return r;
}
var Ne = (e) => (Qe << BigInt(e)) - Qe;
function Hr(e, r, n) {
  if (typeof e != "number" || e < 2) throw new Error("hashLen must be a number");
  if (typeof r != "number" || r < 2) throw new Error("qByteLen must be a number");
  if (typeof n != "function") throw new Error("hmacFn must be a function");
  let t = (u) => new Uint8Array(u), i = (u) => Uint8Array.of(u), o = t(e), s = t(e), a = 0, l = () => {
    o.fill(1), s.fill(0), a = 0;
  }, f = (...u) => n(s, o, ...u), c = (u = t(0)) => {
    s = f(i(0), u), o = f(), u.length !== 0 && (s = f(i(1), u), o = f());
  }, g = () => {
    if (a++ >= 1e3) throw new Error("drbg: tried 1000 values");
    let u = 0, y = [];
    for (; u < r; ) {
      o = f();
      let E = o.slice();
      y.push(E), u += o.length;
    }
    return ne(...y);
  };
  return (u, y) => {
    l(), c(u);
    let E;
    for (; !(E = y(g())); ) c();
    return l(), E;
  };
}
function rt(e, r, n = {}) {
  if (!e || typeof e != "object") throw new Error("expected valid options object");
  function t(i, o, s) {
    let a = e[i];
    if (s && a === void 0) return;
    let l = typeof a;
    if (l !== o || a === null) throw new Error(`param "${i}" is invalid: expected ${o}, got ${l}`);
  }
  Object.entries(r).forEach(([i, o]) => t(i, o, false)), Object.entries(n).forEach(([i, o]) => t(i, o, true));
}
function Vt(e) {
  let r = /* @__PURE__ */ new WeakMap();
  return (n, ...t) => {
    let i = r.get(n);
    if (i !== void 0) return i;
    let o = e(n, ...t);
    return r.set(n, o), o;
  };
}
var _ = BigInt(0), M = BigInt(1), ye = BigInt(2), Pt = BigInt(3), Ht = BigInt(4), Mt = BigInt(5), Mr = BigInt(7), Dt = BigInt(8), Dr = BigInt(9), Zt = BigInt(16);
function W(e, r) {
  let n = e % r;
  return n >= _ ? n : r + n;
}
function Q(e, r, n) {
  let t = e;
  for (; r-- > _; ) t *= t, t %= n;
  return t;
}
function _t(e, r) {
  if (e === _) throw new Error("invert: expected non-zero number");
  if (r <= _) throw new Error("invert: expected positive modulus, got " + r);
  let n = W(e, r), t = r, i = _, o = M, s = M, a = _;
  for (; n !== _; ) {
    let l = t / n, f = t % n, c = i - s * l, g = o - a * l;
    t = n, n = f, i = s, o = a, s = c, a = g;
  }
  if (t !== M) throw new Error("invert: does not exist");
  return W(i, r);
}
function nt(e, r, n) {
  if (!e.eql(e.sqr(r), n)) throw new Error("Cannot find square root");
}
function zt(e, r) {
  let n = (e.ORDER + M) / Ht, t = e.pow(r, n);
  return nt(e, t, r), t;
}
function Zr(e, r) {
  let n = (e.ORDER - Mt) / Dt, t = e.mul(r, ye), i = e.pow(t, n), o = e.mul(r, i), s = e.mul(e.mul(o, ye), i), a = e.mul(o, e.sub(s, e.ONE));
  return nt(e, a, r), a;
}
function _r(e) {
  let r = Ue(e), n = jt(e), t = n(r, r.neg(r.ONE)), i = n(r, t), o = n(r, r.neg(t)), s = (e + Mr) / Zt;
  return (a, l) => {
    let f = a.pow(l, s), c = a.mul(f, t), g = a.mul(f, i), u = a.mul(f, o), y = a.eql(a.sqr(c), l), E = a.eql(a.sqr(g), l);
    f = a.cmov(f, c, y), c = a.cmov(u, g, E);
    let x = a.eql(a.sqr(c), l), I = a.cmov(f, c, x);
    return nt(a, I, l), I;
  };
}
function jt(e) {
  if (e < Pt) throw new Error("sqrt is not defined for small field");
  let r = e - M, n = 0;
  for (; r % ye === _; ) r /= ye, n++;
  let t = ye, i = Ue(e);
  for (; $t(i, t) === 1; ) if (t++ > 1e3) throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1) return zt;
  let o = i.pow(t, r), s = (r + M) / ye;
  return function(a, l) {
    if (a.is0(l)) return l;
    if ($t(a, l) !== 1) throw new Error("Cannot find square root");
    let f = n, c = a.mul(a.ONE, o), g = a.pow(l, r), u = a.pow(l, s);
    for (; !a.eql(g, a.ONE); ) {
      if (a.is0(g)) return a.ZERO;
      let y = 1, E = a.sqr(g);
      for (; !a.eql(E, a.ONE); ) if (y++, E = a.sqr(E), y === f) throw new Error("Cannot find square root");
      let x = M << BigInt(f - y - 1), I = a.pow(c, x);
      f = y, c = a.sqr(I), g = a.mul(g, c), u = a.mul(u, I);
    }
    return u;
  };
}
function zr(e) {
  return e % Ht === Pt ? zt : e % Dt === Mt ? Zr : e % Zt === Dr ? _r(e) : jt(e);
}
var jr = ["create", "isValid", "is0", "neg", "inv", "sqrt", "sqr", "eql", "add", "sub", "mul", "pow", "div", "addN", "subN", "mulN", "sqrN"];
function Yr(e) {
  let r = { ORDER: "bigint", MASK: "bigint", BYTES: "number", BITS: "number" }, n = jr.reduce((t, i) => (t[i] = "function", t), r);
  return rt(e, n), e;
}
function $r(e, r, n) {
  if (n < _) throw new Error("invalid exponent, negatives unsupported");
  if (n === _) return e.ONE;
  if (n === M) return r;
  let t = e.ONE, i = r;
  for (; n > _; ) n & M && (t = e.mul(t, i)), i = e.sqr(i), n >>= M;
  return t;
}
function Yt(e, r, n = false) {
  let t = new Array(r.length).fill(n ? e.ZERO : void 0), i = r.reduce((s, a, l) => e.is0(a) ? s : (t[l] = s, e.mul(s, a)), e.ONE), o = e.inv(i);
  return r.reduceRight((s, a, l) => e.is0(a) ? s : (t[l] = e.mul(s, t[l]), e.mul(s, a)), o), t;
}
function $t(e, r) {
  let n = (e.ORDER - M) / ye, t = e.pow(r, n), i = e.eql(t, e.ONE), o = e.eql(t, e.ZERO), s = e.eql(t, e.neg(e.ONE));
  if (!i && !o && !s) throw new Error("invalid Legendre symbol result");
  return i ? 1 : o ? 0 : -1;
}
function Gt(e, r) {
  r !== void 0 && Y(r);
  let n = r !== void 0 ? r : e.toString(2).length, t = Math.ceil(n / 8);
  return { nBitLength: n, nByteLength: t };
}
function Ue(e, r, n = false, t = {}) {
  if (e <= _) throw new Error("invalid field: expected ORDER > 0, got " + e);
  let i, o, s = false, a;
  if (typeof r == "object" && r != null) {
    if (t.sqrt || n) throw new Error("cannot specify opts in two arguments");
    let u = r;
    u.BITS && (i = u.BITS), u.sqrt && (o = u.sqrt), typeof u.isLE == "boolean" && (n = u.isLE), typeof u.modFromBytes == "boolean" && (s = u.modFromBytes), a = u.allowedLengths;
  } else typeof r == "number" && (i = r), t.sqrt && (o = t.sqrt);
  let { nBitLength: l, nByteLength: f } = Gt(e, i);
  if (f > 2048) throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let c, g = Object.freeze({ ORDER: e, isLE: n, BITS: l, BYTES: f, MASK: Ne(l), ZERO: _, ONE: M, allowedLengths: a, create: (u) => W(u, e), isValid: (u) => {
    if (typeof u != "bigint") throw new Error("invalid field element: expected bigint, got " + typeof u);
    return _ <= u && u < e;
  }, is0: (u) => u === _, isValidNot0: (u) => !g.is0(u) && g.isValid(u), isOdd: (u) => (u & M) === M, neg: (u) => W(-u, e), eql: (u, y) => u === y, sqr: (u) => W(u * u, e), add: (u, y) => W(u + y, e), sub: (u, y) => W(u - y, e), mul: (u, y) => W(u * y, e), pow: (u, y) => $r(g, u, y), div: (u, y) => W(u * _t(y, e), e), sqrN: (u) => u * u, addN: (u, y) => u + y, subN: (u, y) => u - y, mulN: (u, y) => u * y, inv: (u) => _t(u, e), sqrt: o || ((u) => (c || (c = zr(e)), c(g, u))), toBytes: (u) => n ? Kt(u, f) : Pe(u, f), fromBytes: (u, y = true) => {
    if (a) {
      if (!a.includes(u.length) || u.length > f) throw new Error("Field.fromBytes: expected " + a + " bytes, got " + u.length);
      let x = new Uint8Array(f);
      x.set(u, n ? 0 : x.length - u.length), u = x;
    }
    if (u.length !== f) throw new Error("Field.fromBytes: expected " + f + " bytes, got " + u.length);
    let E = n ? qt(u) : Be(u);
    if (s && (E = W(E, e)), !y && !g.isValid(E)) throw new Error("invalid field element: outside of range 0..ORDER");
    return E;
  }, invertBatch: (u) => Yt(g, u), cmov: (u, y, E) => E ? y : u });
  return Object.freeze(g);
}
function Jt(e) {
  if (typeof e != "bigint") throw new Error("field order must be bigint");
  let r = e.toString(2).length;
  return Math.ceil(r / 8);
}
function Xt(e) {
  let r = Jt(e);
  return r + Math.ceil(r / 2);
}
function Wt(e, r, n = false) {
  let t = e.length, i = Jt(r), o = Xt(r);
  if (t < 16 || t < o || t > 1024) throw new Error("expected " + o + "-1024 bytes of input, got " + t);
  let s = n ? qt(e) : Be(e), a = W(s, r - M) + M;
  return n ? Kt(a, i) : Pe(a, i);
}
var xe = BigInt(0), we = BigInt(1);
function He(e, r) {
  let n = r.negate();
  return e ? n : r;
}
function it(e, r) {
  let n = Yt(e.Fp, r.map((t) => t.Z));
  return r.map((t, i) => e.fromAffine(t.toAffine(n[i])));
}
function Qt(e, r) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > r) throw new Error("invalid window size, expected [1.." + r + "], got W=" + e);
}
function ot(e, r) {
  Qt(e, r);
  let n = Math.ceil(r / e) + 1, t = 2 ** (e - 1), i = 2 ** e, o = Ne(e), s = BigInt(e);
  return { windows: n, windowSize: t, mask: o, maxNumber: i, shiftBy: s };
}
function er(e, r, n) {
  let { windowSize: t, mask: i, maxNumber: o, shiftBy: s } = n, a = Number(e & i), l = e >> s;
  a > t && (a -= o, l += we);
  let f = r * t, c = f + Math.abs(a) - 1, g = a === 0, u = a < 0, y = r % 2 !== 0;
  return { nextN: l, offset: c, isZero: g, isNeg: u, isNegF: y, offsetF: f };
}
function Gr(e, r) {
  if (!Array.isArray(e)) throw new Error("array expected");
  e.forEach((n, t) => {
    if (!(n instanceof r)) throw new Error("invalid point at index " + t);
  });
}
function Jr(e, r) {
  if (!Array.isArray(e)) throw new Error("array of scalars expected");
  e.forEach((n, t) => {
    if (!r.isValid(n)) throw new Error("invalid scalar at index " + t);
  });
}
var st = /* @__PURE__ */ new WeakMap(), tr = /* @__PURE__ */ new WeakMap();
function at(e) {
  return tr.get(e) || 1;
}
function rr(e) {
  if (e !== xe) throw new Error("invalid wNAF");
}
var Xr = class {
  constructor(e, r) {
    this.BASE = e.BASE, this.ZERO = e.ZERO, this.Fn = e.Fn, this.bits = r;
  }
  _unsafeLadder(e, r, n = this.ZERO) {
    let t = e;
    for (; r > xe; ) r & we && (n = n.add(t)), t = t.double(), r >>= we;
    return n;
  }
  precomputeWindow(e, r) {
    let { windows: n, windowSize: t } = ot(r, this.bits), i = [], o = e, s = o;
    for (let a = 0; a < n; a++) {
      s = o, i.push(s);
      for (let l = 1; l < t; l++) s = s.add(o), i.push(s);
      o = s.double();
    }
    return i;
  }
  wNAF(e, r, n) {
    if (!this.Fn.isValid(n)) throw new Error("invalid scalar");
    let t = this.ZERO, i = this.BASE, o = ot(e, this.bits);
    for (let s = 0; s < o.windows; s++) {
      let { nextN: a, offset: l, isZero: f, isNeg: c, isNegF: g, offsetF: u } = er(n, s, o);
      n = a, f ? i = i.add(He(g, r[u])) : t = t.add(He(c, r[l]));
    }
    return rr(n), { p: t, f: i };
  }
  wNAFUnsafe(e, r, n, t = this.ZERO) {
    let i = ot(e, this.bits);
    for (let o = 0; o < i.windows && n !== xe; o++) {
      let { nextN: s, offset: a, isZero: l, isNeg: f } = er(n, o, i);
      if (n = s, !l) {
        let c = r[a];
        t = t.add(f ? c.negate() : c);
      }
    }
    return rr(n), t;
  }
  getPrecomputes(e, r, n) {
    let t = st.get(r);
    return t || (t = this.precomputeWindow(r, e), e !== 1 && (typeof n == "function" && (t = n(t)), st.set(r, t))), t;
  }
  cached(e, r, n) {
    let t = at(e);
    return this.wNAF(t, this.getPrecomputes(t, e, n), r);
  }
  unsafe(e, r, n, t) {
    let i = at(e);
    return i === 1 ? this._unsafeLadder(e, r, t) : this.wNAFUnsafe(i, this.getPrecomputes(i, e, n), r, t);
  }
  createCache(e, r) {
    Qt(r, this.bits), tr.set(e, r), st.delete(e);
  }
  hasCache(e) {
    return at(e) !== 1;
  }
};
function Wr(e, r, n, t) {
  let i = r, o = e.ZERO, s = e.ZERO;
  for (; n > xe || t > xe; ) n & we && (o = o.add(i)), t & we && (s = s.add(i)), i = i.double(), n >>= we, t >>= we;
  return { p1: o, p2: s };
}
function Qr(e, r, n, t) {
  Gr(n, e), Jr(t, r);
  let i = n.length, o = t.length;
  if (i !== o) throw new Error("arrays of points and scalars must have equal length");
  let s = e.ZERO, a = Tt(BigInt(i)), l = 1;
  a > 12 ? l = a - 3 : a > 4 ? l = a - 2 : a > 0 && (l = 2);
  let f = Ne(l), c = new Array(Number(f) + 1).fill(s), g = Math.floor((r.BITS - 1) / l) * l, u = s;
  for (let y = g; y >= 0; y -= l) {
    c.fill(s);
    for (let x = 0; x < o; x++) {
      let I = t[x], L = Number(I >> BigInt(y) & f);
      c[L] = c[L].add(n[x]);
    }
    let E = s;
    for (let x = c.length - 1, I = s; x > 0; x--) I = I.add(c[x]), E = E.add(I);
    if (u = u.add(E), y !== 0) for (let x = 0; x < l; x++) u = u.double();
  }
  return u;
}
function nr(e, r, n) {
  if (r) {
    if (r.ORDER !== e) throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return Yr(r), r;
  } else return Ue(e, { isLE: n });
}
function en(e, r, n = {}, t) {
  if (t === void 0 && (t = e === "edwards"), !r || typeof r != "object") throw new Error(`expected valid ${e} CURVE object`);
  for (let a of ["p", "n", "h"]) {
    let l = r[a];
    if (!(typeof l == "bigint" && l > xe)) throw new Error(`CURVE.${a} must be positive bigint`);
  }
  let i = nr(r.p, n.Fp, t), o = nr(r.n, n.Fn, t), s = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (let a of s) if (!i.isValid(r[a])) throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);
  return r = Object.freeze(Object.assign({}, r)), { CURVE: r, Fp: i, Fn: o };
}
var ir = (e, r) => (e + (e >= 0 ? r : -r) / or) / r;
function tn(e, r, n) {
  let [[t, i], [o, s]] = r, a = ir(s * e, n), l = ir(-i * e, n), f = e - a * t - l * o, c = -a * i - l * s, g = f < se, u = c < se;
  g && (f = -f), u && (c = -c);
  let y = Ne(Math.ceil(Tt(n) / 2)) + Se;
  if (f < se || f >= y || c < se || c >= y) throw new Error("splitScalar (endomorphism): failed, k=" + e);
  return { k1neg: g, k1: f, k2neg: u, k2: c };
}
function ut(e) {
  if (!["compact", "recovered", "der"].includes(e)) throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function lt(e, r) {
  let n = {};
  for (let t of Object.keys(r)) n[t] = e[t] === void 0 ? r[t] : e[t];
  return Te(n.lowS, "lowS"), Te(n.prehash, "prehash"), n.format !== void 0 && ut(n.format), n;
}
var rn = class extends Error {
  constructor(e = "") {
    super(e);
  }
}, oe = { Err: rn, _tlv: { encode: (e, r) => {
  let { Err: n } = oe;
  if (e < 0 || e > 256) throw new n("tlv.encode: wrong tag");
  if (r.length & 1) throw new n("tlv.encode: unpadded data");
  let t = r.length / 2, i = Ve(t);
  if (i.length / 2 & 128) throw new n("tlv.encode: long form length too big");
  let o = t > 127 ? Ve(i.length / 2 | 128) : "";
  return Ve(e) + o + i + r;
}, decode(e, r) {
  let { Err: n } = oe, t = 0;
  if (e < 0 || e > 256) throw new n("tlv.encode: wrong tag");
  if (r.length < 2 || r[t++] !== e) throw new n("tlv.decode: wrong tlv");
  let i = r[t++], o = !!(i & 128), s = 0;
  if (!o) s = i;
  else {
    let l = i & 127;
    if (!l) throw new n("tlv.decode(long): indefinite length not supported");
    if (l > 4) throw new n("tlv.decode(long): byte length is too big");
    let f = r.subarray(t, t + l);
    if (f.length !== l) throw new n("tlv.decode: length bytes not complete");
    if (f[0] === 0) throw new n("tlv.decode(long): zero leftmost byte");
    for (let c of f) s = s << 8 | c;
    if (t += l, s < 128) throw new n("tlv.decode(long): not minimal encoding");
  }
  let a = r.subarray(t, t + s);
  if (a.length !== s) throw new n("tlv.decode: wrong value length");
  return { v: a, l: r.subarray(t + s) };
} }, _int: { encode(e) {
  let { Err: r } = oe;
  if (e < se) throw new r("integer: negative integers are not allowed");
  let n = Ve(e);
  if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1) throw new r("unexpected DER parsing assertion: unpadded hex");
  return n;
}, decode(e) {
  let { Err: r } = oe;
  if (e[0] & 128) throw new r("invalid signature integer: negative");
  if (e[0] === 0 && !(e[1] & 128)) throw new r("invalid signature integer: unnecessary leading zero");
  return Be(e);
} }, toSig(e) {
  let { Err: r, _int: n, _tlv: t } = oe, i = V("signature", e), { v: o, l: s } = t.decode(48, i);
  if (s.length) throw new r("invalid signature: left bytes after parsing");
  let { v: a, l } = t.decode(2, o), { v: f, l: c } = t.decode(2, l);
  if (c.length) throw new r("invalid signature: left bytes after parsing");
  return { r: n.decode(a), s: n.decode(f) };
}, hexFromSig(e) {
  let { _tlv: r, _int: n } = oe, t = r.encode(2, n.encode(e.r)), i = r.encode(2, n.encode(e.s)), o = t + i;
  return r.encode(48, o);
} }, se = BigInt(0), Se = BigInt(1), or = BigInt(2), Me = BigInt(3), nn = BigInt(4);
function ge(e, r) {
  let { BYTES: n } = e, t;
  if (typeof r == "bigint") t = r;
  else {
    let i = V("private key", r);
    try {
      t = e.fromBytes(i);
    } catch {
      throw new Error(`invalid private key: expected ui8a of size ${n}, got ${typeof r}`);
    }
  }
  if (!e.isValidNot0(t)) throw new Error("invalid private key: out of range [1..N-1]");
  return t;
}
function on(e, r = {}) {
  let n = en("weierstrass", e, r), { Fp: t, Fn: i } = n, o = n.CURVE, { h: s, n: a } = o;
  rt(r, {}, { allowInfinityPoint: "boolean", clearCofactor: "function", isTorsionFree: "function", fromBytes: "function", toBytes: "function", endo: "object", wrapPrivateKey: "boolean" });
  let { endo: l } = r;
  if (l && (!t.is0(o.a) || typeof l.beta != "bigint" || !Array.isArray(l.basises))) throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  let f = ar(t, i);
  function c() {
    if (!t.isOdd) throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function g(A, p, d) {
    let { x: h, y: w } = p.toAffine(), b = t.toBytes(h);
    if (Te(d, "isCompressed"), d) {
      c();
      let B = !t.isOdd(w);
      return ne(sr(B), b);
    } else return ne(Uint8Array.of(4), b, t.toBytes(w));
  }
  function u(A) {
    pe(A, void 0, "Point");
    let { publicKey: p, publicKeyUncompressed: d } = f, h = A.length, w = A[0], b = A.subarray(1);
    if (h === p && (w === 2 || w === 3)) {
      let B = t.fromBytes(b);
      if (!t.isValid(B)) throw new Error("bad point: is not on curve, wrong x");
      let v = x(B), m;
      try {
        m = t.sqrt(v);
      } catch (k) {
        let T = k instanceof Error ? ": " + k.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + T);
      }
      c();
      let S = t.isOdd(m);
      return (w & 1) === 1 !== S && (m = t.neg(m)), { x: B, y: m };
    } else if (h === d && w === 4) {
      let B = t.BYTES, v = t.fromBytes(b.subarray(0, B)), m = t.fromBytes(b.subarray(B, B * 2));
      if (!I(v, m)) throw new Error("bad point: is not on curve");
      return { x: v, y: m };
    } else throw new Error(`bad point: got length ${h}, expected compressed=${p} or uncompressed=${d}`);
  }
  let y = r.toBytes || g, E = r.fromBytes || u;
  function x(A) {
    let p = t.sqr(A), d = t.mul(p, A);
    return t.add(t.add(d, t.mul(A, o.a)), o.b);
  }
  function I(A, p) {
    let d = t.sqr(p), h = x(A);
    return t.eql(d, h);
  }
  if (!I(o.Gx, o.Gy)) throw new Error("bad curve params: generator point");
  let L = t.mul(t.pow(o.a, Me), nn), P = t.mul(t.sqr(o.b), BigInt(27));
  if (t.is0(t.add(L, P))) throw new Error("bad curve params: a or b");
  function U(A, p, d = false) {
    if (!t.isValid(p) || d && t.is0(p)) throw new Error(`bad point coordinate ${A}`);
    return p;
  }
  function G(A) {
    if (!(A instanceof O)) throw new Error("ProjectivePoint expected");
  }
  function H(A) {
    if (!l || !l.basises) throw new Error("no endo");
    return tn(A, l.basises, i.ORDER);
  }
  let z = Vt((A, p) => {
    let { X: d, Y: h, Z: w } = A;
    if (t.eql(w, t.ONE)) return { x: d, y: h };
    let b = A.is0();
    p == null && (p = b ? t.ONE : t.inv(w));
    let B = t.mul(d, p), v = t.mul(h, p), m = t.mul(w, p);
    if (b) return { x: t.ZERO, y: t.ZERO };
    if (!t.eql(m, t.ONE)) throw new Error("invZ was invalid");
    return { x: B, y: v };
  }), J = Vt((A) => {
    if (A.is0()) {
      if (r.allowInfinityPoint && !t.is0(A.Y)) return;
      throw new Error("bad point: ZERO");
    }
    let { x: p, y: d } = A.toAffine();
    if (!t.isValid(p) || !t.isValid(d)) throw new Error("bad point: x or y not field elements");
    if (!I(p, d)) throw new Error("bad point: equation left != right");
    if (!A.isTorsionFree()) throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  function j(A, p, d, h, w) {
    return d = new O(t.mul(d.X, A), d.Y, d.Z), p = He(h, p), d = He(w, d), p.add(d);
  }
  class O {
    constructor(p, d, h) {
      this.X = U("x", p), this.Y = U("y", d, true), this.Z = U("z", h), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    static fromAffine(p) {
      let { x: d, y: h } = p || {};
      if (!p || !t.isValid(d) || !t.isValid(h)) throw new Error("invalid affine point");
      if (p instanceof O) throw new Error("projective point not allowed");
      return t.is0(d) && t.is0(h) ? O.ZERO : new O(d, h, t.ONE);
    }
    static fromBytes(p) {
      let d = O.fromAffine(E(pe(p, void 0, "point")));
      return d.assertValidity(), d;
    }
    static fromHex(p) {
      return O.fromBytes(V("pointHex", p));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, d = true) {
      return D.createCache(this, p), d || this.multiply(Me), this;
    }
    assertValidity() {
      J(this);
    }
    hasEvenY() {
      let { y: p } = this.toAffine();
      if (!t.isOdd) throw new Error("Field doesn't support isOdd");
      return !t.isOdd(p);
    }
    equals(p) {
      G(p);
      let { X: d, Y: h, Z: w } = this, { X: b, Y: B, Z: v } = p, m = t.eql(t.mul(d, v), t.mul(b, w)), S = t.eql(t.mul(h, v), t.mul(B, w));
      return m && S;
    }
    negate() {
      return new O(this.X, t.neg(this.Y), this.Z);
    }
    double() {
      let { a: p, b: d } = o, h = t.mul(d, Me), { X: w, Y: b, Z: B } = this, v = t.ZERO, m = t.ZERO, S = t.ZERO, k = t.mul(w, w), T = t.mul(b, b), C = t.mul(B, B), R = t.mul(w, b);
      return R = t.add(R, R), S = t.mul(w, B), S = t.add(S, S), v = t.mul(p, S), m = t.mul(h, C), m = t.add(v, m), v = t.sub(T, m), m = t.add(T, m), m = t.mul(v, m), v = t.mul(R, v), S = t.mul(h, S), C = t.mul(p, C), R = t.sub(k, C), R = t.mul(p, R), R = t.add(R, S), S = t.add(k, k), k = t.add(S, k), k = t.add(k, C), k = t.mul(k, R), m = t.add(m, k), C = t.mul(b, B), C = t.add(C, C), k = t.mul(C, R), v = t.sub(v, k), S = t.mul(C, T), S = t.add(S, S), S = t.add(S, S), new O(v, m, S);
    }
    add(p) {
      G(p);
      let { X: d, Y: h, Z: w } = this, { X: b, Y: B, Z: v } = p, m = t.ZERO, S = t.ZERO, k = t.ZERO, T = o.a, C = t.mul(o.b, Me), R = t.mul(d, b), F = t.mul(h, B), K = t.mul(w, v), te = t.add(d, h), q = t.add(b, B);
      te = t.mul(te, q), q = t.add(R, F), te = t.sub(te, q), q = t.add(d, w);
      let Z = t.add(b, v);
      return q = t.mul(q, Z), Z = t.add(R, K), q = t.sub(q, Z), Z = t.add(h, w), m = t.add(B, v), Z = t.mul(Z, m), m = t.add(F, K), Z = t.sub(Z, m), k = t.mul(T, q), m = t.mul(C, K), k = t.add(m, k), m = t.sub(F, k), k = t.add(F, k), S = t.mul(m, k), F = t.add(R, R), F = t.add(F, R), K = t.mul(T, K), q = t.mul(C, q), F = t.add(F, K), K = t.sub(R, K), K = t.mul(T, K), q = t.add(q, K), R = t.mul(F, q), S = t.add(S, R), R = t.mul(Z, q), m = t.mul(te, m), m = t.sub(m, R), R = t.mul(te, F), k = t.mul(Z, k), k = t.add(k, R), new O(m, S, k);
    }
    subtract(p) {
      return this.add(p.negate());
    }
    is0() {
      return this.equals(O.ZERO);
    }
    multiply(p) {
      let { endo: d } = r;
      if (!i.isValidNot0(p)) throw new Error("invalid scalar: out of range");
      let h, w, b = (B) => D.cached(this, B, (v) => it(O, v));
      if (d) {
        let { k1neg: B, k1: v, k2neg: m, k2: S } = H(p), { p: k, f: T } = b(v), { p: C, f: R } = b(S);
        w = T.add(R), h = j(d.beta, k, C, B, m);
      } else {
        let { p: B, f: v } = b(p);
        h = B, w = v;
      }
      return it(O, [h, w])[0];
    }
    multiplyUnsafe(p) {
      let { endo: d } = r, h = this;
      if (!i.isValid(p)) throw new Error("invalid scalar: out of range");
      if (p === se || h.is0()) return O.ZERO;
      if (p === Se) return h;
      if (D.hasCache(this)) return this.multiply(p);
      if (d) {
        let { k1neg: w, k1: b, k2neg: B, k2: v } = H(p), { p1: m, p2: S } = Wr(O, h, b, v);
        return j(d.beta, m, S, w, B);
      } else return D.unsafe(h, p);
    }
    multiplyAndAddUnsafe(p, d, h) {
      let w = this.multiplyUnsafe(d).add(p.multiplyUnsafe(h));
      return w.is0() ? void 0 : w;
    }
    toAffine(p) {
      return z(this, p);
    }
    isTorsionFree() {
      let { isTorsionFree: p } = r;
      return s === Se ? true : p ? p(O, this) : D.unsafe(this, a).is0();
    }
    clearCofactor() {
      let { clearCofactor: p } = r;
      return s === Se ? this : p ? p(O, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(s).is0();
    }
    toBytes(p = true) {
      return Te(p, "isCompressed"), this.assertValidity(), y(O, this, p);
    }
    toHex(p = true) {
      return ee(this.toBytes(p));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(p = true) {
      return this.toBytes(p);
    }
    _setWindowSize(p) {
      this.precompute(p);
    }
    static normalizeZ(p) {
      return it(O, p);
    }
    static msm(p, d) {
      return Qr(O, i, p, d);
    }
    static fromPrivateKey(p) {
      return O.BASE.multiply(ge(i, p));
    }
  }
  O.BASE = new O(o.Gx, o.Gy, t.ONE), O.ZERO = new O(t.ZERO, t.ONE, t.ZERO), O.Fp = t, O.Fn = i;
  let X = i.BITS, D = new Xr(O, r.endo ? Math.ceil(X / 2) : X);
  return O.BASE.precompute(8), O;
}
function sr(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function ar(e, r) {
  return { secretKey: r.BYTES, publicKey: 1 + e.BYTES, publicKeyUncompressed: 1 + 2 * e.BYTES, publicKeyHasPrefix: true, signature: 2 * r.BYTES };
}
function sn(e, r = {}) {
  let { Fn: n } = e, t = r.randomBytes || Ee, i = Object.assign(ar(e.Fp, n), { seed: Xt(n.ORDER) });
  function o(u) {
    try {
      return !!ge(n, u);
    } catch {
      return false;
    }
  }
  function s(u, y) {
    let { publicKey: E, publicKeyUncompressed: x } = i;
    try {
      let I = u.length;
      return y === true && I !== E || y === false && I !== x ? false : !!e.fromBytes(u);
    } catch {
      return false;
    }
  }
  function a(u = t(i.seed)) {
    return Wt(pe(u, i.seed, "seed"), n.ORDER);
  }
  function l(u, y = true) {
    return e.BASE.multiply(ge(n, u)).toBytes(y);
  }
  function f(u) {
    let y = a(u);
    return { secretKey: y, publicKey: l(y) };
  }
  function c(u) {
    if (typeof u == "bigint") return false;
    if (u instanceof e) return true;
    let { secretKey: y, publicKey: E, publicKeyUncompressed: x } = i;
    if (n.allowedLengths || y === E) return;
    let I = V("key", u).length;
    return I === E || I === x;
  }
  function g(u, y, E = true) {
    if (c(u) === true) throw new Error("first arg must be private key");
    if (c(y) === false) throw new Error("second arg must be public key");
    let x = ge(n, u);
    return e.fromHex(y).multiply(x).toBytes(E);
  }
  return Object.freeze({ getPublicKey: l, getSharedSecret: g, keygen: f, Point: e, utils: { isValidSecretKey: o, isValidPublicKey: s, randomSecretKey: a, isValidPrivateKey: o, randomPrivateKey: a, normPrivateKeyToScalar: (u) => ge(n, u), precompute(u = 8, y = e.BASE) {
    return y.precompute(u, false);
  } }, lengths: i });
}
function an(e, r, n = {}) {
  Ie(r), rt(n, {}, { hmac: "function", lowS: "boolean", randomBytes: "function", bits2int: "function", bits2int_modN: "function" });
  let t = n.randomBytes || Ee, i = n.hmac || ((d, ...h) => Re(r, d, ne(...h))), { Fp: o, Fn: s } = e, { ORDER: a, BITS: l } = s, { keygen: f, getPublicKey: c, getSharedSecret: g, utils: u, lengths: y } = sn(e, n), E = { prehash: false, lowS: typeof n.lowS == "boolean" ? n.lowS : false, format: void 0, extraEntropy: false }, x = "compact";
  function I(d) {
    let h = a >> Se;
    return d > h;
  }
  function L(d, h) {
    if (!s.isValidNot0(h)) throw new Error(`invalid signature ${d}: out of range 1..Point.Fn.ORDER`);
    return h;
  }
  function P(d, h) {
    ut(h);
    let w = y.signature, b = h === "compact" ? w : h === "recovered" ? w + 1 : void 0;
    return pe(d, b, `${h} signature`);
  }
  class U {
    constructor(h, w, b) {
      this.r = L("r", h), this.s = L("s", w), b != null && (this.recovery = b), Object.freeze(this);
    }
    static fromBytes(h, w = x) {
      P(h, w);
      let b;
      if (w === "der") {
        let { r: S, s: k } = oe.toSig(pe(h));
        return new U(S, k);
      }
      w === "recovered" && (b = h[0], w = "compact", h = h.subarray(1));
      let B = s.BYTES, v = h.subarray(0, B), m = h.subarray(B, B * 2);
      return new U(s.fromBytes(v), s.fromBytes(m), b);
    }
    static fromHex(h, w) {
      return this.fromBytes(he(h), w);
    }
    addRecoveryBit(h) {
      return new U(this.r, this.s, h);
    }
    recoverPublicKey(h) {
      let w = o.ORDER, { r: b, s: B, recovery: v } = this;
      if (v == null || ![0, 1, 2, 3].includes(v)) throw new Error("recovery id invalid");
      if (a * or < w && v > 1) throw new Error("recovery id is ambiguous for h>1 curve");
      let m = v === 2 || v === 3 ? b + a : b;
      if (!o.isValid(m)) throw new Error("recovery id 2 or 3 invalid");
      let S = o.toBytes(m), k = e.fromBytes(ne(sr((v & 1) === 0), S)), T = s.inv(m), C = H(V("msgHash", h)), R = s.create(-C * T), F = s.create(B * T), K = e.BASE.multiplyUnsafe(R).add(k.multiplyUnsafe(F));
      if (K.is0()) throw new Error("point at infinify");
      return K.assertValidity(), K;
    }
    hasHighS() {
      return I(this.s);
    }
    toBytes(h = x) {
      if (ut(h), h === "der") return he(oe.hexFromSig(this));
      let w = s.toBytes(this.r), b = s.toBytes(this.s);
      if (h === "recovered") {
        if (this.recovery == null) throw new Error("recovery bit must be present");
        return ne(Uint8Array.of(this.recovery), w, b);
      }
      return ne(w, b);
    }
    toHex(h) {
      return ee(this.toBytes(h));
    }
    assertValidity() {
    }
    static fromCompact(h) {
      return U.fromBytes(V("sig", h), "compact");
    }
    static fromDER(h) {
      return U.fromBytes(V("sig", h), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new U(this.r, s.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return ee(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return ee(this.toBytes("compact"));
    }
  }
  let G = n.bits2int || function(d) {
    if (d.length > 8192) throw new Error("input is too large");
    let h = Be(d), w = d.length * 8 - l;
    return w > 0 ? h >> BigInt(w) : h;
  }, H = n.bits2int_modN || function(d) {
    return s.create(G(d));
  }, z = Ne(l);
  function J(d) {
    return Pr("num < 2^" + l, d, se, z), s.toBytes(d);
  }
  function j(d, h) {
    return pe(d, void 0, "message"), h ? pe(r(d), void 0, "prehashed message") : d;
  }
  function O(d, h, w) {
    if (["recovered", "canonical"].some((F) => F in w)) throw new Error("sign() legacy options not supported");
    let { lowS: b, prehash: B, extraEntropy: v } = lt(w, E);
    d = j(d, B);
    let m = H(d), S = ge(s, h), k = [J(S), J(m)];
    if (v != null && v !== false) {
      let F = v === true ? t(y.secretKey) : v;
      k.push(V("extraEntropy", F));
    }
    let T = ne(...k), C = m;
    function R(F) {
      let K = G(F);
      if (!s.isValidNot0(K)) return;
      let te = s.inv(K), q = e.BASE.multiply(K).toAffine(), Z = s.create(q.x);
      if (Z === se) return;
      let Ce = s.create(te * s.create(C + Z * S));
      if (Ce === se) return;
      let St = (q.x === Z ? 0 : 2) | Number(q.y & Se), kt = Ce;
      return b && I(Ce) && (kt = s.neg(Ce), St ^= 1), new U(Z, kt, St);
    }
    return { seed: T, k2sig: R };
  }
  function X(d, h, w = {}) {
    d = V("message", d);
    let { seed: b, k2sig: B } = O(d, h, w);
    return Hr(r.outputLen, s.BYTES, i)(b, B);
  }
  function D(d) {
    let h, w = typeof d == "string" || Fe(d), b = !w && d !== null && typeof d == "object" && typeof d.r == "bigint" && typeof d.s == "bigint";
    if (!w && !b) throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (b) h = new U(d.r, d.s);
    else if (w) {
      try {
        h = U.fromBytes(V("sig", d), "der");
      } catch (B) {
        if (!(B instanceof oe.Err)) throw B;
      }
      if (!h) try {
        h = U.fromBytes(V("sig", d), "compact");
      } catch {
        return false;
      }
    }
    return h || false;
  }
  function A(d, h, w, b = {}) {
    let { lowS: B, prehash: v, format: m } = lt(b, E);
    if (w = V("publicKey", w), h = j(V("message", h), v), "strict" in b) throw new Error("options.strict was renamed to lowS");
    let S = m === void 0 ? D(d) : U.fromBytes(V("sig", d), m);
    if (S === false) return false;
    try {
      let k = e.fromBytes(w);
      if (B && S.hasHighS()) return false;
      let { r: T, s: C } = S, R = H(h), F = s.inv(C), K = s.create(R * F), te = s.create(T * F), q = e.BASE.multiplyUnsafe(K).add(k.multiplyUnsafe(te));
      return q.is0() ? false : s.create(q.x) === T;
    } catch {
      return false;
    }
  }
  function p(d, h, w = {}) {
    let { prehash: b } = lt(w, E);
    return h = j(h, b), U.fromBytes(d, "recovered").recoverPublicKey(h).toBytes();
  }
  return Object.freeze({ keygen: f, getPublicKey: c, getSharedSecret: g, utils: u, lengths: y, Point: e, sign: X, verify: A, recoverPublicKey: p, Signature: U, hash: r });
}
function un(e) {
  let r = { a: e.a, b: e.b, p: e.Fp.ORDER, n: e.n, h: e.h, Gx: e.Gx, Gy: e.Gy }, n = e.Fp, t = e.allowedPrivateKeyLengths ? Array.from(new Set(e.allowedPrivateKeyLengths.map((s) => Math.ceil(s / 2)))) : void 0, i = Ue(r.n, { BITS: e.nBitLength, allowedLengths: t, modFromBytes: e.wrapPrivateKey }), o = { Fp: n, Fn: i, allowInfinityPoint: e.allowInfinityPoint, endo: e.endo, isTorsionFree: e.isTorsionFree, clearCofactor: e.clearCofactor, fromBytes: e.fromBytes, toBytes: e.toBytes };
  return { CURVE: r, curveOpts: o };
}
function ln(e) {
  let { CURVE: r, curveOpts: n } = un(e), t = { hmac: e.hmac, randomBytes: e.randomBytes, lowS: e.lowS, bits2int: e.bits2int, bits2int_modN: e.bits2int_modN };
  return { CURVE: r, curveOpts: n, hash: e.hash, ecdsaOpts: t };
}
function fn(e, r) {
  let n = r.Point;
  return Object.assign({}, r, { ProjectivePoint: n, CURVE: Object.assign({}, e, Gt(n.Fn.ORDER, n.Fn.BITS)) });
}
function cn(e) {
  let { CURVE: r, curveOpts: n, hash: t, ecdsaOpts: i } = ln(e), o = on(r, n), s = an(o, t, i);
  return fn(e, s);
}
function dn(e, r) {
  let n = (t) => cn({ ...e, hash: t });
  return { ...n(r), create: n };
}
var ke = { p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"), n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"), h: BigInt(1), a: BigInt(0), b: BigInt(7), Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"), Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8") }, hn = { beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"), basises: [[BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")], [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]] }, pn = BigInt(0), ur = BigInt(1), ft = BigInt(2);
function yn(e) {
  let r = ke.p, n = BigInt(3), t = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), l = BigInt(88), f = e * e * e % r, c = f * f * e % r, g = Q(c, n, r) * c % r, u = Q(g, n, r) * c % r, y = Q(u, ft, r) * f % r, E = Q(y, i, r) * y % r, x = Q(E, o, r) * E % r, I = Q(x, a, r) * x % r, L = Q(I, l, r) * I % r, P = Q(L, a, r) * x % r, U = Q(P, n, r) * c % r, G = Q(U, s, r) * E % r, H = Q(G, t, r) * f % r, z = Q(H, ft, r);
  if (!De.eql(De.sqr(z), e)) throw new Error("Cannot find square root");
  return z;
}
var De = Ue(ke.p, { sqrt: yn }), lr = dn({ ...ke, Fp: De, lowS: true, endo: hn }, ve), fr = {};
function Ze(e, ...r) {
  let n = fr[e];
  if (n === void 0) {
    let t = ve(Xe(e));
    n = ne(t, t), fr[e] = n;
  }
  return ve(ne(n, ...r));
}
var ct = (e) => e.toBytes(true).slice(1), Oe = lr.Point, dt = (e) => e % ft === pn;
function ht(e) {
  let { Fn: r, BASE: n } = Oe, t = ge(r, e), i = n.multiply(t);
  return { scalar: dt(i.y) ? t : r.neg(t), bytes: ct(i) };
}
function cr(e) {
  let r = De;
  if (!r.isValidNot0(e)) throw new Error("invalid x: Fail if x ≥ p");
  let n = r.create(e * e), t = r.create(n * e + BigInt(7)), i = r.sqrt(t);
  dt(i) || (i = r.neg(i));
  let o = Oe.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
var Le = Be;
function dr(...e) {
  return Oe.Fn.create(Le(Ze("BIP0340/challenge", ...e)));
}
function hr(e) {
  return ht(e).bytes;
}
function wn(e, r, n = Ee(32)) {
  let { Fn: t } = Oe, i = V("message", e), { bytes: o, scalar: s } = ht(r), a = V("auxRand", n, 32), l = t.toBytes(s ^ Le(Ze("BIP0340/aux", a))), f = Ze("BIP0340/nonce", l, o, i), { bytes: c, scalar: g } = ht(f), u = dr(c, o, i), y = new Uint8Array(64);
  if (y.set(c, 0), y.set(t.toBytes(t.create(g + u * s)), 32), !pr(y, i, o)) throw new Error("sign: Invalid signature produced");
  return y;
}
function pr(e, r, n) {
  let { Fn: t, BASE: i } = Oe, o = V("signature", e, 64), s = V("message", r), a = V("publicKey", n, 32);
  try {
    let l = cr(Le(a)), f = Le(o.subarray(0, 32));
    if (!tt(f, ur, ke.p)) return false;
    let c = Le(o.subarray(32, 64));
    if (!tt(c, ur, ke.n)) return false;
    let g = dr(t.toBytes(f), ct(l), s), u = i.multiplyUnsafe(c).add(l.multiplyUnsafe(t.neg(g))), { x: y, y: E } = u.toAffine();
    return !(u.is0() || !dt(E) || y !== f);
  } catch {
    return false;
  }
}
var yr = (() => {
  let e = (n = Ee(48)) => Wt(n, ke.n);
  lr.utils.randomSecretKey;
  function r(n) {
    let t = e(n);
    return { secretKey: t, publicKey: hr(t) };
  }
  return { keygen: r, getPublicKey: hr, sign: wn, verify: pr, Point: Oe, utils: { randomSecretKey: e, randomPrivateKey: e, taggedHash: Ze, lift_x: cr, pointToBytes: ct, numberToBytesBE: Pe, bytesToNumberBE: Be, mod: W }, lengths: { secretKey: 32, publicKey: 32, publicKeyHasPrefix: false, signature: 64, seed: 48 } };
})(), _e = ve;
function gn(e, r, n) {
  return Ie(e), n === void 0 && (n = new Uint8Array(e.outputLen)), Re(e, Ae(n), Ae(r));
}
var pt = Uint8Array.from([0]), wr = Uint8Array.of();
function mn(e, r, n, t = 32) {
  Ie(e), Y(t);
  let i = e.outputLen;
  if (t > 255 * i) throw new Error("Length should be <= 255*HashLen");
  let o = Math.ceil(t / i);
  n === void 0 && (n = wr);
  let s = new Uint8Array(o * i), a = Re.create(e, r), l = a._cloneInto(), f = new Uint8Array(a.outputLen);
  for (let c = 0; c < o; c++) pt[0] = c + 1, l.update(c === 0 ? wr : f).update(n).update(pt).digestInto(f), s.set(f, i * c), a._cloneInto(l);
  return a.destroy(), l.destroy(), de(f, pt), s.slice(0, t);
}
var gr = (e, r, n, t, i) => mn(e, gn(e, r, n), t, i);
function bn(e, r, n, t) {
  Ie(e);
  let i = Ut({ dkLen: 32, asyncTick: 10 }, t), { c: o, dkLen: s, asyncTick: a } = i;
  if (Y(o), Y(s), Y(a), o < 1) throw new Error("iterations (c) should be >= 1");
  let l = Nt(r), f = Nt(n), c = new Uint8Array(s), g = Re.create(e, l), u = g._cloneInto().update(f);
  return { c: o, dkLen: s, asyncTick: a, DK: c, PRF: g, PRFSalt: u };
}
function En(e, r, n, t, i) {
  return e.destroy(), r.destroy(), t && t.destroy(), de(i), n;
}
function mr(e, r, n, t) {
  let { c: i, dkLen: o, DK: s, PRF: a, PRFSalt: l } = bn(e, r, n, t), f, c = new Uint8Array(4), g = Ke(c), u = new Uint8Array(a.outputLen);
  for (let y = 1, E = 0; E < o; y++, E += a.outputLen) {
    let x = s.subarray(E, E + a.outputLen);
    g.setInt32(0, y, false), (f = l._cloneInto(f)).update(c).digestInto(u), x.set(u.subarray(0, x.length));
    for (let I = 1; I < i; I++) {
      a._cloneInto(f).update(u).digestInto(u);
      for (let L = 0; L < x.length; L++) x[L] ^= u[L];
    }
  }
  return En(a, l, s, f, u);
}
function br(e, r, n, t, i, o) {
  let s = e[r++] ^ n[t++], a = e[r++] ^ n[t++], l = e[r++] ^ n[t++], f = e[r++] ^ n[t++], c = e[r++] ^ n[t++], g = e[r++] ^ n[t++], u = e[r++] ^ n[t++], y = e[r++] ^ n[t++], E = e[r++] ^ n[t++], x = e[r++] ^ n[t++], I = e[r++] ^ n[t++], L = e[r++] ^ n[t++], P = e[r++] ^ n[t++], U = e[r++] ^ n[t++], G = e[r++] ^ n[t++], H = e[r++] ^ n[t++], z = s, J = a, j = l, O = f, X = c, D = g, A = u, p = y, d = E, h = x, w = I, b = L, B = P, v = U, m = G, S = H;
  for (let k = 0; k < 8; k += 2) X ^= N(z + B | 0, 7), d ^= N(X + z | 0, 9), B ^= N(d + X | 0, 13), z ^= N(B + d | 0, 18), h ^= N(D + J | 0, 7), v ^= N(h + D | 0, 9), J ^= N(v + h | 0, 13), D ^= N(J + v | 0, 18), m ^= N(w + A | 0, 7), j ^= N(m + w | 0, 9), A ^= N(j + m | 0, 13), w ^= N(A + j | 0, 18), O ^= N(S + b | 0, 7), p ^= N(O + S | 0, 9), b ^= N(p + O | 0, 13), S ^= N(b + p | 0, 18), J ^= N(z + O | 0, 7), j ^= N(J + z | 0, 9), O ^= N(j + J | 0, 13), z ^= N(O + j | 0, 18), A ^= N(D + X | 0, 7), p ^= N(A + D | 0, 9), X ^= N(p + A | 0, 13), D ^= N(X + p | 0, 18), b ^= N(w + h | 0, 7), d ^= N(b + w | 0, 9), h ^= N(d + b | 0, 13), w ^= N(h + d | 0, 18), B ^= N(S + m | 0, 7), v ^= N(B + S | 0, 9), m ^= N(v + B | 0, 13), S ^= N(m + v | 0, 18);
  i[o++] = s + z | 0, i[o++] = a + J | 0, i[o++] = l + j | 0, i[o++] = f + O | 0, i[o++] = c + X | 0, i[o++] = g + D | 0, i[o++] = u + A | 0, i[o++] = y + p | 0, i[o++] = E + d | 0, i[o++] = x + h | 0, i[o++] = I + w | 0, i[o++] = L + b | 0, i[o++] = P + B | 0, i[o++] = U + v | 0, i[o++] = G + m | 0, i[o++] = H + S | 0;
}
function yt(e, r, n, t, i) {
  let o = t + 0, s = t + 16 * i;
  for (let a = 0; a < 16; a++) n[s + a] = e[r + (2 * i - 1) * 16 + a];
  for (let a = 0; a < i; a++, o += 16, r += 16) br(n, s, e, r, n, o), a > 0 && (s += 16), br(n, o, e, r += 16, n, s);
}
function vn(e, r, n) {
  let t = Ut({ dkLen: 32, asyncTick: 10, maxmem: 1073742848 }, n), { N: i, r: o, p: s, dkLen: a, asyncTick: l, maxmem: f, onProgress: c } = t;
  if (Y(i), Y(o), Y(s), Y(a), Y(l), Y(f), c !== void 0 && typeof c != "function") throw new Error("progressCb should be function");
  let g = 128 * o, u = g / 4, y = Math.pow(2, 32);
  if (i <= 1 || (i & i - 1) !== 0 || i > y) throw new Error("Scrypt: N must be larger than 1, a power of 2, and less than 2^32");
  if (s < 0 || s > (y - 1) * 32 / g) throw new Error("Scrypt: p must be a positive integer less than or equal to ((2^32 - 1) * 32) / (128 * r)");
  if (a < 0 || a > (y - 1) * 32) throw new Error("Scrypt: dkLen should be positive integer less than or equal to (2^32 - 1) * 32");
  if (g * (i + s) > f) throw new Error("Scrypt: memused is bigger than maxMem. Expected 128 * r * (N + p) > maxmem of " + f);
  let E = mr(ve, e, r, { c: 1, dkLen: g * s }), x = Je(E), I = Je(new Uint8Array(g * i)), L = Je(new Uint8Array(g)), P = () => {
  };
  if (c) {
    let U = 2 * i * s, G = Math.max(Math.floor(U / 1e4), 1), H = 0;
    P = () => {
      H++, c && (!(H % G) || H === U) && c(H / U);
    };
  }
  return { N: i, r: o, p: s, dkLen: a, blockSize32: u, V: I, B32: x, B: E, tmp: L, blockMixCb: P, asyncTick: l };
}
function Bn(e, r, n, t, i) {
  let o = mr(ve, e, n, { c: 1, dkLen: r });
  return de(n, t, i), o;
}
async function xn(e, r, n) {
  let { N: t, r: i, p: o, dkLen: s, blockSize32: a, V: l, B32: f, B: c, tmp: g, blockMixCb: u, asyncTick: y } = vn(e, r, n);
  Ot(f);
  for (let E = 0; E < o; E++) {
    let x = a * E;
    for (let L = 0; L < a; L++) l[L] = f[x + L];
    let I = 0;
    await Rt(t - 1, y, () => {
      yt(l, I, l, I += a, i), u();
    }), yt(l, (t - 1) * a, f, x, i), u(), await Rt(t, y, () => {
      let L = f[x + a - 16] % t;
      for (let P = 0; P < a; P++) g[P] = f[x + P] ^ l[L * a + P];
      yt(g, 0, f, x, i), u();
    });
  }
  return Ot(f), Bn(e, s, c, l, g);
}
var Er = ["wss://nos.lol", "wss://relay.primal.net", "wss://nostr.mom", "wss://relay.snort.social", "wss://relay.nostr.dev.br"], $ = 30078, vr = 4454, Sn = 720 * 3600, fe = new TextEncoder(), wt = new TextDecoder(), ze = () => Math.floor(networkNow() / 1000), gt = (e) => {
  let r = "";
  for (let n = 0; n < e.length; n += 32768) r += String.fromCharCode(...e.subarray(n, n + 32768));
  return btoa(r);
}, je = (e) => Uint8Array.from(atob(e), (r) => r.charCodeAt(0)), kn = () => ee(Ee(32)), mt = (e) => ee(yr.getPublicKey(he(e))), me = (e, { kind: r, tags: n = [], content: t = "", created_at: i = ze() }) => {
  let o = mt(e), s = _e(fe.encode(JSON.stringify([0, o, i, r, n, t])));
  return { id: ee(s), pubkey: o, created_at: i, kind: r, tags: n, content: t, sig: ee(yr.sign(s, he(e))) };
}, ce = (e, r) => e.tags?.find((n) => n[0] === r)?.[1];

const relayPreferenceKey = "pulse:networkRelays";
const previousDefaultRelayUrls = new Set([
  "wss://nos.lol", "wss://relay.primal.net", "wss://nostr.mom", "wss://relay.snort.social",
  "wss://nostr.oxtr.dev", "wss://offchain.pub", "wss://nostr-pub.wellorder.net", "wss://relay.nostr.net"
]);
const maxPendingEvents = 128;
const responseGraceMs = 750;
const terminalCloseReason = /^(blocked|restricted|auth-required|pow|invalid|mute):/i;
const partialQueries = new WeakSet();
let nextSubscriptionId = 0;

function normalizeRelayUrls(preferred) {
  const entries = Array.isArray(preferred) ? preferred : typeof preferred === "string" ? preferred.split(/\s+/) : [];
  const urls = new Set();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const value = entry.trim();
    if (!/^wss:\/\/[^\s]+$/i.test(value)) continue;
    let url;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    if (!url.hostname || url.username || url.password || url.hash) continue;
    urls.add(url.origin + (url.pathname === "/" ? "" : url.pathname) + url.search);
  }
  const normalized = [...urls];
  // Some installations saved the entire old default list as a preference.
  if (normalized.length === previousDefaultRelayUrls.size && normalized.every((url) => previousDefaultRelayUrls.has(url))) return [];
  return normalized;
}

export function relayUrls(preferred) {
  const urls = normalizeRelayUrls(preferred);
  return urls.length ? urls : [...Er];
}

export function savedRelayPreference() {
  try {
    return normalizeRelayUrls(JSON.parse(globalThis.localStorage?.getItem(relayPreferenceKey) ?? "null"));
  } catch {
    return [];
  }
}

export function savedRelayUrls() {
  return relayUrls(savedRelayPreference());
}

export function rememberRelayUrls(preferred) {
  const urls = normalizeRelayUrls(preferred);
  try {
    if (urls.length) globalThis.localStorage?.setItem(relayPreferenceKey, JSON.stringify(urls));
    else globalThis.localStorage?.removeItem(relayPreferenceKey);
  } catch {
  }
  return urls;
}

function relayUnavailable() {
  return Object.assign(new Error("Сеть Pulse недоступна. Проверь соединение с релеями в настройках сети."), { code: "RELAY_UNAVAILABLE" });
}

export function queryWasComplete(events) {
  return !partialQueries.has(events);
}

function preserveCoverage(events, output) {
  if (!queryWasComplete(events)) partialQueries.add(output);
  return output;
}

class Relay {
  constructor(url, pool) {
    this.url = url;
    this.pool = pool;
    this.socket = null;
    this.readable = false;
    this.closed = false;
    this.reconnectDelay = 2000;
    this.reconnectTimer = null;
    this.subscriptionRetries = new Map();
    this.pendingEvents = new Map();
    this.expiryTimer = null;
  }

  get open() {
    return this.socket?.readyState === 1;
  }

  connect() {
    if (this.closed || this.socket || this.reconnectTimer !== null) return;
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.reconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectDelay = 2000;
      for (const [id, subscription] of this.pool.subs) this.send(["REQ", id, ...subscription.filters]);
      this.flushEvents();
      this.pool.changed();
    };
    socket.onmessage = ({ data }) => {
      if (this.socket !== socket) return;
      let frame;
      try {
        frame = JSON.parse(data);
      } catch {
        return;
      }
      if (Array.isArray(frame)) this.pool.onMessage(this, frame);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.readable = false;
      this.clearSubscriptionRetries();
      this.reconnect();
      this.pool.changed();
    };
  }

  reconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 120000);
  }

  resume() {
    if (this.reconnectTimer === null) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectDelay = 2000;
    this.connect();
  }

  send(frame) {
    if (!this.open) return false;
    try {
      this.socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  retrySubscription(id) {
    const retry = this.subscriptionRetries.get(id) ?? { delay: 1000, timer: null };
    if (retry.timer !== null) return;
    this.subscriptionRetries.set(id, retry);
    retry.timer = setTimeout(() => {
      retry.timer = null;
      const subscription = this.pool.subs.get(id);
      if (subscription) this.send(["REQ", id, ...subscription.filters]);
    }, retry.delay);
    retry.delay = Math.min(retry.delay * 2, 30000);
  }

  cancelSubscriptionRetry(id) {
    clearTimeout(this.subscriptionRetries.get(id)?.timer);
    this.subscriptionRetries.delete(id);
  }

  clearSubscriptionRetries() {
    for (const retry of this.subscriptionRetries.values()) clearTimeout(retry.timer);
    this.subscriptionRetries.clear();
  }

  publish(event, expiresAt) {
    if (this.send(["EVENT", event])) return;
    const previous = this.pendingEvents.get(event.id);
    this.pendingEvents.delete(event.id);
    this.pendingEvents.set(event.id, { event, expiresAt: Math.max(expiresAt, previous?.expiresAt ?? 0) });
    if (this.pendingEvents.size > maxPendingEvents) this.pendingEvents.delete(this.pendingEvents.keys().next().value);
    this.scheduleExpiry();
  }

  scheduleExpiry() {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    if (!this.pendingEvents.size) return;
    const nextExpiry = Math.min(...Array.from(this.pendingEvents.values(), (pending) => pending.expiresAt));
    this.expiryTimer = setTimeout(() => {
      const now = performance.now();
      for (const [id, pending] of this.pendingEvents) {
        if (pending.expiresAt <= now) this.pendingEvents.delete(id);
      }
      this.scheduleExpiry();
    }, Math.max(0, nextExpiry - performance.now()));
  }

  flushEvents() {
    const now = performance.now();
    for (const [id, { event, expiresAt }] of this.pendingEvents) {
      if (expiresAt <= now || this.send(["EVENT", event])) this.pendingEvents.delete(id);
    }
    this.scheduleExpiry();
  }

  close() {
    this.closed = true;
    this.readable = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.expiryTimer);
    this.clearSubscriptionRetries();
    this.pendingEvents.clear();
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {
    }
  }
}

class Pool {
  constructor(urls = savedRelayUrls()) {
    this.urls = [...new Set(urls)];
    this.relays = this.urls.map((url) => new Relay(url, this));
    this.subs = new Map();
    this.acks = new Map();
    this.listeners = new Set();
    this.stopped = false;
    this.onOnline = () => {
      for (const relay of this.relays) relay.resume();
    };
  }

  start() {
    if (this.stopped) return this;
    globalThis.window?.addEventListener?.("online", this.onOnline);
    for (const relay of this.relays) relay.connect();
    return this;
  }

  stop() {
    this.stopped = true;
    globalThis.window?.removeEventListener?.("online", this.onOnline);
    for (const relay of this.relays) relay.close();
    this.changed();
  }

  openCount() {
    return this.relays.filter((relay) => relay.open).length;
  }

  readableCount() {
    return this.relays.filter((relay) => relay.open && relay.readable).length;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    const open = this.openCount();
    for (const listener of this.listeners) listener(open);
  }

  onMessage(relay, [type, id, value, details]) {
    if (type === "OK") {
      if (typeof value !== "boolean") return;
      for (const listener of this.acks.get(id) ?? []) listener(relay.url, value || /^duplicate(?::|$)/i.test(details ?? ""));
      return;
    }
    const subscription = this.subs.get(id);
    if (!subscription) return;
    if (type === "CLOSED") {
      if (terminalCloseReason.test(value ?? "")) {
        relay.cancelSubscriptionRetry(id);
        subscription.onClosed?.(relay);
      } else relay.retrySubscription(id);
      return;
    }
    if (type !== "EOSE" && (type !== "EVENT" || typeof value?.id !== "string" || !value.id)) return;
    if (type === "EVENT" && !subscription.seen.has(value.id) && subscription.acceptEvent && !subscription.acceptEvent(value)) return;

    relay.cancelSubscriptionRetry(id);
    if (!relay.readable) {
      relay.readable = true;
      this.changed();
    }
    if (type === "EOSE") {
      subscription.eose.add(relay.url);
      subscription.onEose?.(subscription.eose.size, relay.url);
    } else if (!subscription.seen.has(value.id)) {
      subscription.seen.add(value.id);
      subscription.onEvent?.(value, relay.url);
    }
  }

  publish(event, timeout = 7000) {
    if (this.stopped || !this.relays.length) return Promise.resolve({ ok: 0, failed: 0 });
    const duration = Number.isFinite(timeout) ? Math.min(2147483647, Math.max(0, timeout)) : 7000;
    const expiresAt = performance.now() + duration;
    return new Promise((resolve) => {
      const listeners = this.acks.get(event.id) ?? new Set();
      const responses = new Map();
      let ok = 0;
      let graceTimer;
      const finish = () => {
        if (!listeners.delete(onAck)) return;
        if (!listeners.size) this.acks.delete(event.id);
        clearTimeout(timer);
        clearTimeout(graceTimer);
        const failed = responses.size - ok;
        traceNetwork("publish", { kind: event.kind, accepted: ok, refused: failed, total: this.relays.length }, event.id);
        resolve({ ok, failed });
      };
      const onAck = (url, accepted) => {
        if (responses.get(url) === true) return;
        responses.set(url, accepted);
        if (accepted) ok++;
        if (ok >= 2 || responses.size === this.relays.length ||
            (ok > 0 && this.relays.every((relay) => !relay.open || responses.has(relay.url)))) finish();
        else if (ok && graceTimer === undefined) graceTimer = setTimeout(finish, responseGraceMs);
      };
      const timer = setTimeout(finish, duration);
      listeners.add(onAck);
      this.acks.set(event.id, listeners);
      for (const relay of this.relays) {
        relay.connect();
        relay.publish(event, expiresAt);
      }
    });
  }

  subscribe(filters, { acceptEvent, onEvent, onEose, onClosed } = {}) {
    const id = "p" + (++nextSubscriptionId).toString(36) + Math.random().toString(36).slice(2, 6);
    const subscription = { filters: Array.isArray(filters) ? filters : [filters], acceptEvent, onEvent, onEose, onClosed, seen: new Set(), eose: new Set() };
    this.subs.set(id, subscription);
    for (const relay of this.relays) {
      relay.connect();
      relay.send(["REQ", id, ...subscription.filters]);
    }
    return () => {
      this.subs.delete(id);
      for (const relay of this.relays) {
        relay.cancelSubscriptionRetry(id);
        relay.send(["CLOSE", id]);
      }
    };
  }

  query(filters, { timeout = 6000, requireComplete = false, waitForAll = false, acceptEvent } = {}) {
    if (this.stopped || !this.relays.length) return Promise.reject(relayUnavailable());
    return new Promise((resolve, reject) => {
      const events = [];
      const completed = new Set();
      const closed = new Map();
      let settleTimer;
      const finish = () => {
        clearTimeout(deadline);
        clearTimeout(settleTimer);
        unlisten();
        unsubscribe();
        const complete = completed.size === this.relays.length;
        if (!complete) partialQueries.add(events);
        traceNetwork("query", { received: events.length, eose: completed.size, refused: closed.size, total: this.relays.length });
        if (events.length || (requireComplete ? complete : completed.size > 0)) resolve(events);
        else reject(relayUnavailable());
      };
      const settleOnProgress = () => {
        clearTimeout(settleTimer);
        if (this.relays.every((relay) => completed.has(relay.url) || closed.get(relay) === relay.socket)) {
          settleTimer = setTimeout(finish, 0);
        }
        // An empty early relay may not share any data with a peer on a later relay.
        else if (!waitForAll && events.length && completed.size >= Math.max(1, Math.ceil(this.openCount() / 2))) {
          settleTimer = setTimeout(finish, responseGraceMs);
        }
      };
      const deadline = setTimeout(finish, timeout);
      const unlisten = this.onChange(settleOnProgress);
      const unsubscribe = this.subscribe(filters, {
        acceptEvent,
        onEvent: (event) => {
          events.push(event);
          settleOnProgress();
        },
        onEose: (_count, url) => {
          completed.add(url);
          settleOnProgress();
        },
        onClosed: (relay) => {
          closed.set(relay, relay.socket);
          settleOnProgress();
        }
      });
    });
  }
}

var bt = (e) => crypto.subtle.importKey("raw", e, "AES-GCM", false, ["encrypt", "decrypt"]), Ye = async (e, r) => {
  let n = crypto.getRandomValues(new Uint8Array(12)), t = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: n }, e, r)), i = new Uint8Array(12 + t.length);
  return i.set(n), i.set(t, 12), gt(i);
}, $e = async (e, r) => {
  let n = je(r);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: n.subarray(0, 12) }, e, n.subarray(12)));
}, Rn = async (e) => new Uint8Array(await new Response(new Blob([e]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()), Nn = async (e) => new Uint8Array(await new Response(new Blob([e]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()), Et = (e) => bt(gr(_e, he(e), fe.encode("pulse-self-v1"), new Uint8Array(0), 32)), vt = /* @__PURE__ */ new Map(), Un = async (e, r) => {
  if (vt.has(r)) return vt.get(r);
  let n = await crypto.subtle.importKey("raw", je(r), { name: "ECDH", namedCurve: "P-256" }, false, []), t = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: n }, e, 256)), i = await bt(gr(_e, t, fe.encode("pulse-mail-v1"), new Uint8Array(0), 32));
  return vt.set(r, i), i;
}, Bt = /^[a-z0-9_]{3,24}$/, Ln = (e) => String(e ?? "").trim().replace(/^@+/, "").toLowerCase(), Cn = (e) => e ? e.length < 3 ? "Ник — минимум 3 символа" : e.length > 24 ? "Ник — максимум 24 символа" : Bt.test(e) ? null : "Только латиница, цифры и _" : "Придумай @ник", Br = { N: 2 ** 16, r: 8, p: 1 }, xr = async (e, r, n = Br) => bt(await xn(fe.encode(e.normalize("NFKC")), r, { ...n, dkLen: 32, asyncTick: 20 })), Fn = async (e, r) => {
  let n = Ee(16), t = await xr(e, n);
  return JSON.stringify({ v: 1, kdf: { ...Br, salt: gt(n) }, data: await Ye(t, fe.encode(JSON.stringify(r))) });
}, qn = async (e, r) => {
  let n = JSON.parse(r), t = await xr(e, je(n.kdf.salt), { N: n.kdf.N, r: n.kdf.r, p: n.kdf.p });
  return JSON.parse(wt.decode(await $e(t, n.data)));
}, Kn = (e, r, n, t) => me(e, { kind: $, tags: [["d", "pulse-acct"], ["n", r], ["t", "pulse-acct"], ["since", String(t || ze())]], content: n }), Tn = (e) => Number(ce(e, "since")) || e.created_at,
Pn = (e, r, n) => me(e, { kind: $, tags: [["d", "pulse-profile"], ["t", "pulse-user"], ["n", r.nick], ["since", String(n || ze())]], content: JSON.stringify({ v: 1, ...r }) }), xt = (e) => {
  try {
    return JSON.parse(e);
  } catch {
    return null;
  }
}, Ge = (e, r) => {
  let n = /* @__PURE__ */ new Map();
  for (let t of e) {
    let i = r(t);
    i && (!n.has(i) || n.get(i).created_at < t.created_at) && n.set(i, t);
  }
  return [...n.values()];
}, kr = async (e) => ee(_e(fe.encode("pulse-room-dir:" + e))).slice(0, 24), Dn = async (e, r) => me(e, { kind: $, tags: [["d", "pulse-room:" + await kr(r.code)], ["t", "pulse-room"]], content: JSON.stringify(r.hidden ? { v: 1, hidden: true } : { v: 1, name: r.name, code: r.code, icon: r.icon || null, by: r.by || "", desc: r.desc || "" }) }), Zn = async (e) => {
  let r = await e.query({ kinds: [$], "#t": ["pulse-room"], limit: 2e3 }, { timeout: 7e3 }), n = Ge(r, (t) => ce(t, "d")).map((t) => ({ ...xt(t.content), at: t.created_at })).filter((t) => t && !t.hidden && typeof t.code == "string" && /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/.test(t.code) && t.name);
  return preserveCoverage(r, Ge(n.map((t) => ({ ...t, created_at: t.at })), (t) => t.code));
}, _n = async (e, r) => me(e, { kind: $, tags: [["d", "pulse-sync"]], content: await Ye(await Et(e), await Rn(fe.encode(JSON.stringify(r)))) }),
$n = async (e, r, n, t, i = []) => me(e, { kind: vr, tags: [["p", r], ["expiration", String(ze() + Sn)], ...i], content: await Ye(n, fe.encode(JSON.stringify(t))) }), Gn = async (e, r) => {
  try {
    return JSON.parse(wt.decode(await $e(e, r.content)));
  } catch {
    return null;
  }
}, Jn = async (e, r = 72) => {
  if (!e) return null;
  try {
    let n = await createImageBitmap(await (await fetch(e)).blob()), t = document.createElement("canvas");
    t.width = t.height = r;
    let i = Math.min(n.width, n.height);
    t.getContext("2d").drawImage(n, (n.width - i) / 2, (n.height - i) / 2, i, i, 0, 0, r, r);
    let o = t.toDataURL("image/webp", 0.7);
    return o.length < 14e3 ? o : null;
  } catch {
    return null;
  }
};
const friendCodePattern = /^id-[1-9A-HJ-NP-Za-km-z]{16,24}$/;
const directoryProfileEvents = new WeakMap();
const verifiedDirectoryProfiles = new WeakSet();
const p256Signature = { name: "ECDSA", hash: "SHA-256" };
const onlineAddress = "pulse-presence";
const offlineAddress = "pulse-presence-offline";
const validDirectoryEnvelope = event => event?.kind === $ && Number.isSafeInteger(event.created_at)
  && event.created_at >= 0 && Array.isArray(event.tags)
  && event.tags.every(tag => Array.isArray(tag) && tag.every(value => typeof value === "string"))
  && typeof event.content === "string";
const validFriendCode = code => typeof code === "string" && code === code.trim() && friendCodePattern.test(code);
const contactHash = (domain, code) => _e(fe.encode(`${domain}:${code}`));
const contactAddress = code => `pulse-contact:${ee(contactHash("pulse-contact-address-v1", code))}`;
const contactKey = code => bt(contactHash("pulse-contact-key-v1", code));
const contactProof = (code, npub, profile) => fe.encode(JSON.stringify(["pulse-contact-v1", code, npub, profile.pub, profile.dhPub, profile.name, profile.nick]));

export function verifyAppEvent(event) {
  if (!validDirectoryEnvelope(event) || typeof event.pubkey !== "string" || !/^[0-9a-f]{64}$/.test(event.pubkey)
      || typeof event.sig !== "string" || !/^[0-9a-f]{128}$/.test(event.sig)) return false;
  const hash = _e(fe.encode(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])));
  return ee(hash) === event.id && yr.verify(event.sig, hash, event.pubkey);
}

export function presenceEvent(secret, { online = true, createdAt } = {}) {
  return me(secret, {
    kind: $, tags: [["d", online ? onlineAddress : offlineAddress]],
    content: online ? "" : "offline", created_at: createdAt,
  });
}

export function presenceFilter(authors) {
  return { kinds: [$], authors, "#d": [onlineAddress, offlineAddress] };
}

export function readPresence(event) {
  if ((event?.content !== "" && event?.content !== "offline") || !verifyAppEvent(event)) return null;
  const online = event.content === "";
  if (ce(event, "d") !== (online ? onlineAddress : offlineAddress)) return null;
  const at = event.created_at * 1000;
  return Number.isSafeInteger(at) ? { at, online } : null;
}

function requireDirectoryAnswer(events, requireComplete) {
  if (requireComplete && !queryWasComplete(events)) throw relayUnavailable();
}

function signedEventMatching(matches) {
  const verified = new WeakSet();
  return event => {
    if (verified.has(event)) return true;
    if (!verifyAppEvent(event) || !matches(event)) return false;
    verified.add(event);
    return true;
  };
}

function hasNicknameTags(event, nick, topic, address) {
  return ce(event, "n") === nick && ce(event, "t") === topic && ce(event, "d") === address;
}

export async function findVaults(pool, nick, { requireComplete = false, waitForAll = false } = {}) {
  const acceptEvent = signedEventMatching(event => hasNicknameTags(event, nick, "pulse-acct", "pulse-acct"));
  const events = await pool.query({ kinds: [$], "#t": ["pulse-acct"], "#n": [nick] }, { waitForAll, acceptEvent });
  const vaults = events.filter(acceptEvent);
  if (!vaults.length) requireDirectoryAnswer(events, requireComplete);
  return preserveCoverage(events, vaults);
}

export async function nickOwner(pool, nick, { requireComplete = false } = {}) {
  const acceptEvent = signedEventMatching(event => hasNicknameTags(event, nick, "pulse-user", "pulse-profile")
    || hasNicknameTags(event, nick, "pulse-acct", "pulse-acct"));
  const events = await pool.query({ kinds: [$], "#t": ["pulse-user", "pulse-acct"], "#n": [nick] }, {
    waitForAll: requireComplete, acceptEvent,
  });
  const owners = new Map();
  for (const event of events) {
    if (!acceptEvent(event)) continue;
    const since = Tn(event);
    if (!owners.has(event.pubkey) || owners.get(event.pubkey) > since) owners.set(event.pubkey, since);
  }
  if (!owners.size) requireDirectoryAnswer(events, requireComplete);
  return [...owners].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

export async function fetchSync(pool, secret) {
  const pubkey = mt(secret);
  const acceptEvent = signedEventMatching(event => event.pubkey === pubkey && ce(event, "d") === "pulse-sync");
  const events = await pool.query({ kinds: [$], authors: [pubkey], "#d": ["pulse-sync"] }, {
    waitForAll: true, acceptEvent,
  });
  const snapshots = events.filter(acceptEvent)
    .sort((left, right) => right.created_at - left.created_at || left.id.localeCompare(right.id));
  if (!snapshots.length) {
    requireDirectoryAnswer(events, true);
    return null;
  }
  const key = await Et(secret);
  for (const snapshot of snapshots) {
    try {
      const data = JSON.parse(wt.decode(await Nn(await $e(key, snapshot.content))));
      if (data && typeof data === "object" && !Array.isArray(data)) return preserveCoverage(events, { at: snapshot.created_at, data });
    } catch {
    }
  }
  throw Object.assign(new Error("Сохранённую копию Pulse не удалось прочитать."), { code: "SYNC_UNREADABLE" });
}

function parseDirectoryProfile(event) {
  if (!validDirectoryEnvelope(event) || ce(event, "d") !== "pulse-profile" || ce(event, "t") !== "pulse-user") return null;
  const data = xt(event.content);
  if (!data || typeof data.nick !== "string" || !Bt.test(data.nick) || ce(event, "n") !== data.nick || !validFriendCode(data.code)) return null;
  const profile = { ...data, npub: event.pubkey, since: Number(ce(event, "since")) || event.created_at, at: event.created_at };
  directoryProfileEvents.set(profile, event);
  return profile;
}

async function validPulseIdentity({ pub, dhPub }, code) {
  if (typeof pub !== "string" || typeof dhPub !== "string") return false;
  try {
    const signingKey = je(pub), exchangeKey = je(dhPub);
    return signingKey.length === 65 && signingKey[0] === 4 && exchangeKey.length === 65 && exchangeKey[0] === 4
      && await friendCodeForPub(pub) === code;
  } catch {
    return false;
  }
}

export async function verifyDirectoryProfile(profile) {
  if (verifiedDirectoryProfiles.has(profile)) return true;
  const event = directoryProfileEvents.get(profile);
  if (!event || !verifyAppEvent(event) || !await validPulseIdentity(profile, profile.code)) return false;
  verifiedDirectoryProfiles.add(profile);
  return true;
}

export async function fetchPeople(pool, { requireComplete = false } = {}) {
  const events = await pool.query({ kinds: [$], "#t": ["pulse-user"], limit: 2000 }, { timeout: 7000 });
  const profiles = Ge(events, event => event.pubkey).map(parseDirectoryProfile).filter(Boolean);
  if (!profiles.length) requireDirectoryAnswer(events, requireComplete);
  return preserveCoverage(events, profiles);
}

export async function lookupNick(pool, nick, { requireComplete = false } = {}) {
  const acceptEvent = signedEventMatching(event => hasNicknameTags(event, nick, "pulse-user", "pulse-profile"));
  const events = await pool.query({ kinds: [$], "#t": ["pulse-user"], "#n": [nick] }, { acceptEvent });
  const signedProfiles = events.filter(acceptEvent);
  const profiles = signedProfiles.map(parseDirectoryProfile).filter(profile => profile?.nick === nick)
    .sort((left, right) => left.since - right.since || right.at - left.at);
  for (const profile of profiles) if (await verifyDirectoryProfile(profile)) return profile;
  requireDirectoryAnswer(events, requireComplete);
  if (requireComplete && signedProfiles.length) {
    throw Object.assign(new Error("Контактная карточка пока недоступна."), { code: "CONTACT_PENDING" });
  }
  return null;
}

export async function contactEvent(secret, { code, pub, dhPub, name, nick }, signingKey) {
  if (!validFriendCode(code)) throw new Error("Некорректный ID для друзей");
  const profile = {
    v: 1, pub, dhPub,
    name: typeof name === "string" ? name.slice(0, 64) : "",
    nick: typeof nick === "string" && Bt.test(nick) ? nick : "",
  };
  const npub = mt(secret);
  const proof = gt(new Uint8Array(await crypto.subtle.sign(p256Signature, signingKey, contactProof(code, npub, profile))));
  const content = await Ye(await contactKey(code), fe.encode(JSON.stringify({ ...profile, proof })));
  return me(secret, { kind: $, tags: [["d", contactAddress(code)]], content });
}

export async function lookupFriendCode(pool, code, { requireComplete = false, waitForAll = false } = {}) {
  if (!validFriendCode(code)) return null;
  const address = contactAddress(code);
  const acceptEvent = signedEventMatching(event => ce(event, "d") === address);
  const events = await pool.query({ kinds: [$], "#d": [address] }, { waitForAll, acceptEvent });
  const key = await contactKey(code);
  for (const event of events.filter(acceptEvent).sort((left, right) => right.created_at - left.created_at)) {
    try {
      const profile = JSON.parse(wt.decode(await $e(key, event.content)));
      if (profile?.v !== 1 || typeof profile.name !== "string" || typeof profile.nick !== "string" || !await validPulseIdentity(profile, code)) continue;
      const signingKey = await crypto.subtle.importKey("raw", je(profile.pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      if (!await crypto.subtle.verify(p256Signature, signingKey, je(profile.proof), contactProof(code, event.pubkey, profile))) continue;
      const record = { code, npub: event.pubkey, pub: profile.pub, dhPub: profile.dhPub, name: profile.name, nick: profile.nick, at: event.created_at };
      verifiedDirectoryProfiles.add(record);
      return record;
    } catch {
      // Continue to another relay's record if this card is unreadable.
    }
  }
  requireDirectoryAnswer(events, requireComplete);
  return null;
}

export {
  $ as KIND_APP,
  vr as KIND_MAIL,
  Bt as NICK_RE,
  Pool,
  Er as RELAYS,
  gt as b64,
  Zn as fetchRooms,
  $n as mailEvent,
  kn as newSecret,
  Cn as nickError,
  Ln as normNick,
  $e as open,
  qn as openVault,
  Un as pairKey,
  Pn as profileEvent,
  mt as pubOf,
  Gn as readMail,
  Dn as roomEvent,
  kr as roomId,
  Ye as seal,
  Fn as sealVault,
  Et as selfKey,
  me as signEvent,
  Tn as sinceOf,
  _n as syncEvent,
  Jn as tinyImage,
  je as unb64,
  Kn as vaultEvent
};
