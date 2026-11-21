import { A as X, H as a, I as c, J as P, L as E, M as v, Q as te, R as ae, T as _, U as ne, V as re, Z as B, _ as oe, a as L, b as g, ba as se, c as V, ca as S, da as le, e as ie, f as $, g as j, h as z, k as w, la as ce, n as de, o as me, q as ue, r as W, x as be, z as ke } from "./chunk-7GRP2DEX.js";
import * as s from "./net.js";
import { getPool as D, publishDirectoryContact, publishDirectoryProfile } from "./account.js";
import { networkNow } from "./network-time.js";
document.documentElement.classList.toggle("lowfps", localStorage.getItem("pulse:lowfps") !== "0"), document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("page-hidden", document.hidden));
var h = (e) => {
  document.getElementById("modal-backdrop").classList.toggle("hidden", !e), document.getElementById("terms-modal").classList.toggle("hidden", !e);
};
document.getElementById("ob-terms-open").addEventListener("click", () => h(true)), document.getElementById("terms-x").addEventListener("click", () => h(false)), document.getElementById("terms-no").addEventListener("click", () => {
  document.getElementById("ob-terms").checked = false, h(false);
}), document.getElementById("terms-yes").addEventListener("click", () => {
  document.getElementById("ob-terms").checked = true, h(false);
}), document.getElementById("modal-backdrop").addEventListener("click", () => h(false));
var Q = ["#7c5cff", "#00b8ff", "#ff4d8d", "#ff8a3d", "#2ee59d", "#c86bfa", "#ffcc33", "#3dd6d0"], R = 8, y = "neon", q = Q[Math.floor(Math.random() * Q.length)], d = null, N = null, O = null, x = (e) => {
  for (let n of document.querySelectorAll(".ob-step")) n.classList.toggle("hidden", n.id !== e);
  let t = a(e).querySelector("input:not([type=checkbox])");
  setTimeout(() => t?.focus(), 250);
}, i = (e, t, n) => {
  a(e).textContent = t, n?.focus(), a(e).closest(".ob-step").animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(-4px)" }, { transform: "none" }], { duration: 320 });
}, m = (e, t, n) => {
  e.disabled = t, t ? (e.dataset.label = e.innerHTML, e.textContent = n) : e.dataset.label && (e.innerHTML = e.dataset.label);
};
document.querySelectorAll(".pw-eye").forEach((e) => e.addEventListener("click", () => {
  let t = e.parentElement.querySelector("input");
  t.type = t.type === "password" ? "text" : "password";
}));
var U = (e, t) => {
  let n = a(t);
  a(e).addEventListener("input", (r) => {
    let { score: o, label: l } = W(r.target.value);
    n.dataset.score = r.target.value ? o : "", n.querySelector("b").textContent = r.target.value ? `Пароль: ${l}` : "";
  });
};
U("ob-pw", "ob-pw-meter"), U("mg-pw", "mg-pw-meter");
var Z = (e, t, n, r) => e.length < R ? (i(n, `Пароль должен быть не короче ${R} символов`, r), false) : W(e).score === 0 ? (i(n, "Слишком простой пароль — добавь цифры, буквы разного регистра или символы", r), false) : e !== t ? (i(n, "Пароли не совпадают", r), false) : true, f = async (e) => {
  localStorage.setItem("pulse:lastAccount", e.id), E({ prefix: L(e.id), key: e.mk }), await le(e), e.keys ? await X(e.keys) : await be(), ce(e), sessionStorage.removeItem("pulse:locked"), a("onboarding").classList.add("hidden"), await import("./chunk-ITVMY7Q3.js");
}, F = () => {
  let e = g();
  a("acc-list").replaceChildren(...e.map((t) => c("button", { class: `acc-card${d === t.id ? " active" : ""}`, onclick: () => {
    d = t.id, S(t.theme || "neon"), a("login-error").textContent = "", F(), a("login-pw").focus();
  } }, _(t, "lg"), c("div", { class: "f-main" }, c("div", { class: "f-name", text: t.name }), c("div", { class: "f-sub", text: t.legacy ? "аккаунт из прошлой версии" : "защищён паролем" })), d === t.id ? P("check", "sm") : null)));
}, A = () => {
  let e = g();
  (!d || !e.some((n) => n.id === d)) && (d = e.find((n) => n.id === V())?.id || e[0]?.id);
  let t = e.find((n) => n.id === d);
  t?.theme && S(t.theme), F(), a("login-pw").value = "", a("login-error").textContent = "", x("ob-login");
};
a("login-form").addEventListener("submit", async (e) => {
  if (e.preventDefault(), !d) return;
  let t = a("login-btn");
  m(t, true, "Расшифровываем…");
  try {
    let n = await z(d, a("login-pw").value);
    a("login-remember").checked && await w(n.id, n.mk), await f(n);
  } catch (n) {
    m(t, false), i("login-error", n instanceof j ? "Неверный пароль" : n.message, a("login-pw")), a("login-pw").select();
  }
}), a("login-forgot").addEventListener("click", () => {
  let e = g().find((n) => n.id === d);
  if (!e) return;
  let t = c("div", { class: "toast", style: { "pointer-events": "auto", "flex-direction": "column" } }, c("div", { style: { display: "flex", gap: "10px" } }, P("info", "sm"), c("span", { text: `Пароль нельзя восстановить: им зашифрованы ключи и переписка. Можно войти по резервной копии или удалить аккаунт «${e.name}» с этого устройства.` })), c("div", { class: "btn-row" }, c("button", { class: "btn sm glass", text: "Отмена", onclick: () => t.remove() }), c("button", { class: "btn sm danger", text: "Удалить с устройства", onclick: async () => {
    t.remove(), await me(e.id), d = null, ee();
  } })));
  a("toasts").append(t);
}), document.querySelectorAll("[data-goto]").forEach((e) => e.addEventListener("click", () => {
  let t = e.dataset.goto;
  t === "ob-login" ? A() : t === "ob-step1" ? T() : pe();
}));
var G = () => a("ob-themes").replaceChildren(...Object.entries(se).map(([e, t]) => c("button", { class: `theme-dot${y === e ? " active" : ""}`, title: t.name, dataset: { theme: e }, style: { background: `linear-gradient(135deg, ${t.a1}, ${t.a2})` }, onclick: () => {
  y = e, S(y), G();
} }))), J = () => a("ob-avatar-preview").replaceChildren(_({ name: a("ob-name").value || "?", color: q, avatar: N }, "xl")), T = () => {
  a("ob-to-login").classList.toggle("hidden", !g().length), G(), J(), a("ob-error").textContent = "", x("ob-step1");
};
a("ob-name").addEventListener("input", J), a("ob-avatar").addEventListener("click", async () => {
  let e = await re();
  if (e) try {
    N = await ne(e), J();
  } catch (t) {
    B(t.message, "bad");
  }
});
var H = null, K = async () => {
  let e = s.normNick(a("ob-nick").value), t = a("ob-nick-state");
  if (!e) return t.textContent = "", null;
  let n = s.nickError(e);
  if (n) return t.textContent = n, t.className = "nk-state bad", { ok: false, text: n };
  t.textContent = "Проверяем…", t.className = "nk-state";
  let r;
  try {
    r = await s.nickOwner(D(), e, { requireComplete: true })
      ? { ok: false, text: `@${e} уже занят` }
      : { ok: true, text: `@${e} свободен` };
  } catch {
    r = { ok: true, unsure: true, text: "Не удалось проверить ник. Pulse повторит проверку после подключения." };
  }
  return s.normNick(a("ob-nick").value) === e && (t.textContent = r.text, t.className = r.unsure ? "nk-state" : `nk-state ${r.ok ? "ok" : "bad"}`), r;
}, Y = null;
a("ob-nick").addEventListener("input", () => {
  clearTimeout(Y), Y = setTimeout(K, 450);
}), a("ob-create").addEventListener("click", async () => {
  let e = te(a("ob-name").value);
  if (!e) {
    i("ob-error", "Введи имя", a("ob-name"));
    return;
  }
  let t = s.normNick(a("ob-nick").value), n = s.nickError(t);
  if (n) {
    i("ob-error", n, a("ob-nick"));
    return;
  }
  let r = a("ob-pw").value;
  if (!Z(r, a("ob-pw2").value, "ob-error", a("ob-pw"))) return;
  if (!a("ob-terms").checked) {
    i("ob-error", "Сначала прими условия пользования (да, душу тоже)"), h(true);
    return;
  }
  let o = a("ob-create");
  m(o, true, "Проверяем @ник…");
  let l = await K();
  if (m(o, false), !l?.ok) {
    i("ob-error", l?.text || "Ник занят", a("ob-nick"));
    return;
  }
  x("ob-step2");
  let [u] = await Promise.all([ke(), new Promise((M) => setTimeout(M, 900))]);
  u.nostr = s.newSecret();
  let C = { name: e, color: q, avatar: N, theme: y, nick: t, pub: u.signPub }, b = await $({ password: r, card: C, keys: u });
  const nickSince = Math.floor(networkNow() / 1000);
  const settings = { account: true, name: e, bio: ae(a("ob-bio").value), avatar: N, color: q, theme: y, nick: t, nickSince, npub: s.pubOf(u.nostr) };
  a("ob-remember").checked && await w(b.id, b.mk), E({ prefix: L(b.id), key: b.mk }), v.set("settings", settings), a("ob-gen-sub").textContent = "Закрепляем @" + t + " в сети…";
  let p = await s.sealVault(r, { keys: u, nick: t, card: { name: e, color: q, theme: y } });
  const vault = { nick: t, sealed: p };
  v.set("vault", { ...vault, pending: true, checkNick: true });
  let confirmed = false;
  if (!l.unsure) {
    const result = await D().publish(s.vaultEvent(u.nostr, t, p, nickSince)).catch(() => null);
    confirmed = !!result?.ok;
    if (confirmed) v.set("vault", vault);
  }
  let k = await X(u);
  const pool = D();
  const [profile] = await Promise.all([
    confirmed ? publishDirectoryProfile(pool, u.nostr, k, settings).catch(() => null) : null,
    pool.openCount() ? publishDirectoryContact(pool, u.nostr, k, { name: e, nick: confirmed ? t : "" }).catch(() => null) : null,
  ]);
  const published = Boolean(profile?.ok);
  H = b;
  let I = document.querySelector(".keygen");
  I.classList.add("done"), I.querySelector("use").setAttribute("href", "#i-check"), a("ob-gen-title").textContent = `Добро пожаловать, ${e}!`;
  a("ob-gen-sub").textContent = published
    ? `Ты @${t}. С этим ником и паролем можно войти на телефоне и любом ПК.`
    : confirmed
      ? `Ник @${t} сохранён. Pulse повторит публикацию карточки в каталоге после входа.`
      : `Аккаунт сохранён на этом устройстве. Pulse повторит регистрацию @${t}, когда появится связь с каталогом.`;
  a("ob-id").replaceChildren(c("span", { text: published ? "@" + t : k.friendCode }), P("copy", "sm"));
  a("ob-done").classList.remove("hidden");
}), a("ob-id").addEventListener("click", () => oe(a("ob-id").textContent.trim(), "Скопировано — отправь другу"));
var ge = () => {
  a("rl-error").textContent = "", x("ob-remote");
};
document.querySelectorAll("[data-remote]").forEach((e) => e.addEventListener("click", ge)), a("rl-back").addEventListener("click", () => g().length ? A() : T()), a("rl-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let t = s.normNick(a("rl-nick").value), n = a("rl-pw").value, r = a("rl-btn");
  if (s.nickError(t)) return i("rl-error", "Впиши свой @ник", a("rl-nick"));
  if (!n) return i("rl-error", "Впиши пароль", a("rl-pw"));
  m(r, true, "Ищем аккаунт…");
  try {
    let o = await s.findVaults(D(), t, { requireComplete: true, waitForAll: true });
    if (!o.length) throw new Error(`Аккаунт @${t} не найден на настроенных релеях. Проверь ник.`);
    m(r, false), m(r, true, "Расшифровываем…");
    const latestByAuthor = new Map();
    for (const vault of [...o].sort((left, right) => right.created_at - left.created_at || left.id.localeCompare(right.id))) {
      if (!latestByAuthor.has(vault.pubkey)) latestByAuthor.set(vault.pubkey, vault);
    }
    let l = null, u = 0;
    let rejectedVault = false;
    const owners = [...latestByAuthor.values()].sort((left, right) => s.sinceOf(left) - s.sinceOf(right) || left.pubkey.localeCompare(right.pubkey));
    for (const vault of owners) {
      let candidate;
      try {
        candidate = await s.openVault(n, vault.content);
      } catch {
        continue;
      }
      let author;
      try {
        author = s.pubOf(candidate?.keys?.nostr);
      } catch {}
      if (!candidate?.keys?.signPub || author !== vault.pubkey || candidate.nick && s.normNick(candidate.nick) !== t) {
        rejectedVault = true;
        continue;
      }
      l = candidate;
      u = s.sinceOf(vault);
      break;
    }
    if (!l?.keys?.signPub) {
      if (!s.queryWasComplete(o)) throw new Error("Не удалось проверить вход. Часть каталога недоступна. Попробуй снова.");
      if (rejectedVault) throw new Error("Копия аккаунта не соответствует подписи каталога.");
      throw new j("Неверный пароль");
    }
    let C = g().find((k) => k.pub === l.keys.signPub);
    if (C) try {
      let k = await z(C.id, n);
      a("rl-remember").checked && await w(k.id, k.mk), await f(k);
      return;
    } catch {
    }
    let b = { ...l.card, nick: t, pub: l.keys.signPub }, p = await $({ password: n, card: b, keys: l.keys });
    E({ prefix: L(p.id), key: p.mk }), v.set("settings", { account: true, name: b.name || t, color: b.color, theme: b.theme || "neon", nick: t, npub: s.pubOf(l.keys.nostr), nickSince: u }), v.set("vault", { nick: t, sealed: await s.sealVault(n, l) }), a("rl-remember").checked && await w(p.id, p.mk), B(`С возвращением, @${t}! Подтягиваем друзей и комнаты…`, "ok", 5e3), await f(p);
  } catch (o) {
    m(r, false), i("rl-error", o instanceof j ? "Неверный пароль" : o.message, a("rl-pw"));
  }
}), a("ob-go").addEventListener("click", () => H && f(H));
var pe = () => {
  O = null, a("rs-file-name").textContent = "Выбрать файл копии", a("rs-error").textContent = "", x("ob-restore");
};
a("rs-back").addEventListener("click", () => g().length ? A() : T()), a("rs-file").addEventListener("click", () => {
  let e = c("input", { type: "file", accept: ".pulse,application/json,application/octet-stream,*/*" });
  e.addEventListener("change", async () => {
    let t = e.files?.[0];
    if (t) {
      if (t.size > 64 * 1024 * 1024) {
        i("rs-error", "Файл слишком большой для копии");
        return;
      }
      O = await t.text(), a("rs-file-name").textContent = t.name, a("rs-pw").focus();
    }
  }), e.click();
}), a("rs-btn").addEventListener("click", async () => {
  if (!O) {
    i("rs-error", "Сначала выбери файл копии");
    return;
  }
  let e = a("rs-btn");
  m(e, true, "Расшифровываем…");
  try {
    let t = a("rs-pw").value, n = await ue(O, t), r = await $({ password: t, card: n.card, keys: n.keys });
    E({ prefix: L(r.id), key: r.mk });
    for (let [o, l] of Object.entries(n.store || {})) l != null && v.set(o, l);
    a("rs-remember").checked && await w(r.id, r.mk), B(`Аккаунт «${n.card?.name}» восстановлен`, "ok"), await f(r);
  } catch (t) {
    m(e, false), i("rs-error", t.message, a("rs-pw"));
  }
});
var fe = () => {
  let e = JSON.parse(localStorage.getItem("pulse:settings") || "{}");
  a("mg-name").textContent = e.name || "", e.theme && S(e.theme), x("ob-migrate");
};
a("mg-btn").addEventListener("click", async () => {
  let e = a("mg-pw").value;
  if (!Z(e, a("mg-pw2").value, "mg-error", a("mg-pw"))) return;
  let t = a("mg-btn");
  m(t, true, "Шифруем данные…");
  let n = JSON.parse(localStorage.getItem("pulse:settings") || "{}"), r = await $({ password: e, legacy: true, card: { name: n.name || "Аккаунт", color: n.color, avatar: n.avatar || null, theme: n.theme } });
  E({ prefix: L(r.id), key: r.mk });
  for (let o of Object.keys(localStorage)) if (!(!o.startsWith("pulse:") || o.startsWith("pulse:acc:") || o === "pulse:accounts" || o === "pulse:lastAccount" || o === "pulse:networkRelays")) {
    try {
      v.set(o.slice(6), JSON.parse(localStorage.getItem(o)));
    } catch {
    }
    localStorage.removeItem(o);
  }
  a("mg-remember").checked && await w(r.id, r.mk), await f(r);
});
var ee = async () => {
  if (a("onboarding").classList.remove("hidden"), ie()) {
    fe();
    return;
  }
  if (!g().length) {
    T();
    return;
  }
  let e = V();
  if (e && !sessionStorage.getItem("pulse:locked")) {
    let t = await de(e);
    if (t) {
      await f(t);
      return;
    }
  }
  A();
};
S(g().find((e) => e.id === V())?.theme || "neon"), ee().catch((e) => {
  console.error(e), B("Ошибка запуска: " + e.message, "bad", 1e4);
});
