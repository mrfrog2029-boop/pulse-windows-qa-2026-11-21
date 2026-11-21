import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as settle, setTimeout as wait } from "node:timers/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { A as loadIdentity, z as generateIdentity } from "../web/js/chunk-7GRP2DEX.js";
import * as net from "../web/js/net.js";

globalThis.WebSocket = class {
    constructor() { throw new Error("The social tests use simulated relays"); }
};

let moduleVersion = 0;

async function makeIdentity(nick) {
    const keys = { ...await generateIdentity(), nostr: net.newSecret() };
    const identity = await loadIdentity(keys);
    return {
        keys,
        identity,
        profile: {
            nick,
            npub: net.pubOf(keys.nostr),
            code: identity.friendCode,
            pub: identity.pub,
            dhPub: identity.dhPub,
            name: nick,
        },
    };
}

const local = await makeIdentity("local_test");
const remote = await makeIdentity("remote_test");
const remoteProfileEvent = net.profileEvent(remote.keys.nostr, remote.profile, 60);
const relayUnavailable = () => Object.assign(new Error("Нет связи с релеями"), { code: "RELAY_UNAVAILABLE" });
const eventAddress = event => event.tags.find(([key]) => key === "d")?.[1];

async function until(condition) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (condition()) return;
        await wait(5);
    }
    assert.fail("Expected asynchronous account work to finish");
}

async function partialResults(events) {
    const first = { url: "wss://first.test", socket: {} };
    const second = { url: "wss://second.test", socket: {} };
    return net.Pool.prototype.query.call({
        relays: [first, second],
        openCount: () => 2,
        onChange: () => () => {},
        subscribe(_filter, handlers) {
            queueMicrotask(() => {
                events.forEach(handlers.onEvent);
                handlers.onEose(1, first.url);
                handlers.onClosed(second);
            });
            return () => {};
        },
    }, {}, { timeout: 100 });
}

async function fixture(t, {
    settings = {}, storage = {}, stored = {}, contacts = [], rooms = [],
    query = async () => [], publish = async () => ({ ok: 1, failed: 0 }),
    connected = 1, legacy = false, person = local, presenceStatus = () => "unknown",
} = {}) {
    const memory = new Map(Object.entries(stored));
    const device = new Map(Object.entries(storage));
    const accountSettings = { nick: person.profile.nick, name: person.profile.name, nickSince: 60, ...settings };
    const events = [];
    const queries = [];
    const subscriptions = [];
    const intervals = new Map();
    const nodes = new Map();
    const invitations = [];
    const legacyRequests = [];
    const outgoing = [];
    const incoming = [];
    const notices = [];
    const presences = [];
    const openedModals = [];
    const changes = new Set();
    let renders = 0;

    const browserStorage = { getItem: key => device.get(key) ?? null, setItem: (key, value) => device.set(key, value), removeItem: key => device.delete(key) };
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {
            value: "", children: [], writes: 0, listeners: new Map(), focus() {},
            addEventListener(type, callback) { this.listeners.set(type, callback); },
            replaceChildren(...children) { this.writes++; this.children = children; },
        });
        return nodes.get(id);
    };

    const browserGlobals = { window: {}, localStorage: browserStorage, sessionStorage: browserStorage, document: { getElementById: node, addEventListener() {} } };
    for (const [name, value] of Object.entries(browserGlobals)) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
        t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
    }
    t.mock.method(globalThis, "setInterval", (callback, duration) => intervals.set(duration, callback));
    const timeouts = new Set();
    const schedule = globalThis.setTimeout;
    const cancel = globalThis.clearTimeout;
    t.mock.method(globalThis, "setTimeout", (callback, duration, ...args) => {
        const timer = schedule(() => {
            timeouts.delete(timer);
            callback(...args);
        }, duration);
        timeouts.add(timer);
        return timer;
    });
    t.after(() => timeouts.forEach(cancel));
    const pools = new Set();
    t.mock.method(net.Pool.prototype, "start", function () { pools.add(this); return this; });
    t.after(() => pools.forEach(pool => pool.stop()));
    t.mock.method(net.Pool.prototype, "openCount", () => connected);
    t.mock.method(net.Pool.prototype, "onChange", listener => {
        changes.add(listener);
        return () => changes.delete(listener);
    });
    t.mock.method(net.Pool.prototype, "subscribe", (filter, handlers) => {
        const sub = { filter, ...handlers };
        subscriptions.push(sub);
        return () => subscriptions.splice(subscriptions.indexOf(sub), 1);
    });
    t.mock.method(net.Pool.prototype, "query", async (filter, options) => {
        queries.push(filter);
        return query(filter, options);
    });
    t.mock.method(net.Pool.prototype, "publish", async (event, timeout) => {
        events.push(event);
        return publish(event, timeout);
    });

    const account = await import(`../web/js/account.js?isolation=${++moduleVersion}`);
    const context = {
        account: () => ({ keys: legacy ? null : person.keys }),
        identity: () => person.identity,
        settings: accountSettings,
        store: { get: (key, defaultValue) => memory.get(key) ?? defaultValue, set: (key, value) => memory.set(key, value) },
        friends: () => ({
            list: () => contacts,
            get: pub => contacts.find(friend => friend.pub === pub),
            addByCode: async code => {
                legacyRequests.push(code);
                if (!outgoing.some(request => request.code === code)) outgoing.push({ code });
            },
            outgoing: () => outgoing,
            requestFrom: (profile, reply) => incoming.push({ profile, reply }),
            snapshot: () => ({ friends: contacts, out: [], declined: [] }),
            merge: snapshot => {
                const added = snapshot.friends.filter(friend => !contacts.some(existing => existing.pub === friend.pub));
                contacts.push(...added);
                return Boolean(added.length);
            },
            setFriendInfo: (pub, info) => Object.assign(contacts.find(friend => friend.pub === pub), info),
            setPresence: (...args) => presences.push(args),
            getPresence: presenceStatus,
            isOnline: pub => presenceStatus(pub) === "online",
        }),
        rooms: { list: () => rooms, save() {} },
        saveSettings() {}, rerender: () => { renders++; },
        onRoomInvite: (friend, invite) => invitations.push([friend, invite]),
        el: (tag, attrs, ...children) => ({ tag, ...attrs, children }),
        avatar: ({ name }) => ({ name }),
        toast: message => notices.push(message),
        openModal: id => openedModals.push(id),
    };
    return {
        account, accountSettings, events, queries, legacyRequests, outgoing, incoming, intervals, subscriptions, invitations, notices, openedModals, memory, device, presences,
        start: () => account.start(context),
        get renders() { return renders; },
        setConnected(count) { connected = count; changes.forEach(listener => listener(count)); },
        typeSearch(text) {
            const input = node("friend-search");
            input.value = text;
            input.listeners.get("input")();
            return node("search-results").children;
        },
        searchValue: () => node("friend-search").value,
        async search(text) {
            const input = node("friend-search");
            const results = node("search-results");
            const writes = results.writes;
            input.value = text;
            input.listeners.get("input")();
            await until(() => results.writes > writes && results.children[0]?.class !== "sr-loading");
            return results.children;
        },
    };
}

test("exact nick sends an encrypted request without relying on the bulk directory", async t => {
    const app = await fixture(t, { query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [] });
    await app.start();
    assert.deepEqual(await app.account.addFriend("@ReMoTe_TeSt"), { delivered: true });
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
    const request = app.events.find(event => event.kind === net.KIND_MAIL);
    assert.deepEqual(request.tags.find(([key]) => key === "p"), ["p", remote.profile.npub]);
    const key = await net.pairKey(remote.identity.dh.privateKey, local.identity.dhPub);
    assert.equal((await net.readMail(key, request)).t, "req");
    assert.equal(app.queries.some(filter => filter.limit === 2000), false);
});

test("direct add by ID remains queued while directory lookup is unavailable", async t => {
    const app = await fixture(t, { query: async () => { throw relayUnavailable(); } });
    await app.start();
    assert.deepEqual(await app.account.addFriend(`Мой ID: ${remote.profile.code}`), { delivered: false });
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
});

test("the add form resolves a nickname from a signed old profile when the exact nickname filter is unsupported", async t => {
    const app = await fixture(t, { query: async filter => {
        if (filter["#n"]?.[0] === "remote_test") throw relayUnavailable();
        return filter["#t"]?.[0] === "pulse-user" ? [remoteProfileEvent] : [];
    } });
    await app.start();
    assert.deepEqual(await app.account.addFriend("@remote_test"), { delivered: true });
    const request = app.events.find(event => event.kind === net.KIND_MAIL);
    assert.deepEqual(request.tags.find(([key]) => key === "p"), ["p", remote.profile.npub]);
});

test("pasting a copied ID in sidebar search exposes the add action even with an empty directory", async t => {
    const app = await fixture(t, { query: async () => [] });
    await app.start();
    const results = await app.search(`ID друга: ${remote.profile.code}`);
    const entry = results.find(result => result.class === "sr-item");
    assert.ok(entry);
    const addButton = entry.children.find(child => child.tag === "button");
    await addButton.onclick({ currentTarget: addButton });
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
});

test("an existing migrated account publishes a private addressable contact without changing its friend ID", async t => {
    const app = await fixture(t, { legacy: true, settings: { nick: undefined } });
    await app.start();
    await until(() => app.events.some(event => eventAddress(event)?.startsWith("pulse-contact:")));
    const card = app.events.find(event => eventAddress(event).startsWith("pulse-contact:"));
    assert.equal(JSON.stringify(card).includes(local.profile.code), false);
    assert.equal(JSON.stringify(card).includes(app.accountSettings.name), false);
    const found = await net.lookupFriendCode({ query: async filter => {
        assert.deepEqual(filter["#d"], [eventAddress(card)]);
        return [card];
    } }, local.profile.code);
    assert.equal(found.code, local.profile.code);
    assert.equal(found.pub, local.profile.pub);
    assert.equal(found.dhPub, local.profile.dhPub);
    assert.equal(found.npub, app.accountSettings.npub);
});

test("adding by ID looks up the signed private contact with exact case and sends without a bulk read", async t => {
    const card = await net.contactEvent(remote.keys.nostr, remote.profile, remote.identity.pair.privateKey);
    const app = await fixture(t, { query: async filter => filter["#d"]?.[0] === eventAddress(card) ? [card] : [] });
    await app.start();
    assert.deepEqual(await app.account.addFriend(`ID-${remote.profile.code.slice(3)}`), { delivered: true });
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
    assert.equal(app.queries.some(filter => filter["#t"]?.includes("pulse-user")), false);
    const mail = app.events.find(event => event.kind === net.KIND_MAIL);
    const remoteKey = await net.pairKey(remote.identity.dh.privateKey, local.identity.dhPub);
    assert.equal((await net.readMail(remoteKey, mail)).t, "req");
});

test("contact discovery ignores a damaged card and checks the complete case-sensitive ID", async () => {
    const card = await net.contactEvent(remote.keys.nostr, remote.profile, remote.identity.pair.privateKey);
    const damaged = { ...card, content: "unreadable-card" };
    const read = (code, records) => net.lookupFriendCode({ query: async () => records }, code);
    assert.equal(await read(remote.profile.code, [damaged]), null);
    assert.equal((await read(remote.profile.code, [damaged, card])).npub, remote.profile.npub);
    const original = remote.profile.code;
    const different = "id-" + original.slice(3).replace(/[a-hj-km-np-z]/i, letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase());
    assert.notEqual(different, original);
    assert.equal(await read(different, [card]), null);
});

test("a queued ID-only request resolves a newly published contact after reconnection", async t => {
    const card = await net.contactEvent(remote.keys.nostr, remote.profile, remote.identity.pair.privateKey);
    let hasContact = false;
    const app = await fixture(t, { query: async filter => hasContact && filter["#d"]?.[0] === eventAddress(card) ? [card] : [] });
    await app.start();
    assert.deepEqual(await app.account.addFriend(remote.profile.code), { delivered: false });
    assert.equal(app.events.some(event => event.kind === net.KIND_MAIL), false);
    hasContact = true;
    app.setConnected(0);
    app.setConnected(1);
    await until(() => app.events.some(event => event.kind === net.KIND_MAIL));
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
});

test("a shareable nickname reaches the catalogue while cloud restore is still waiting", async t => {
    let release;
    const restore = new Promise(resolve => { release = resolve; });
    const app = await fixture(t, { query: async filter => filter["#d"]?.[0] === "pulse-sync" ? restore : [] });
    const startup = app.start();
    try {
        await until(() => app.queries.some(filter => filter["#d"]?.[0] === "pulse-sync"));
        await until(() => app.account.nickDirectoryStatus() === "published");
    } finally {
        release([]);
        await startup;
    }
});

test("a pasted safety fingerprint points to the shareable ID instead of searching for a person", async t => {
    const app = await fixture(t);
    await app.start();
    const fingerprint = "1234-ABCD-5678";
    await assert.rejects(app.account.addFriend(fingerprint), /Попроси друга скопировать ID/);
    const result = await app.search(fingerprint);
    assert.match(result[0].text, /отпечаток ключа/);
    assert.equal(app.legacyRequests.length, 0);
});

test("welcome, add dialog, and settings copy an ID until the catalogue accepts the nickname", () => {
    const source = readFileSync(new URL("../web/js/chunk-ITVMY7Q3.js", import.meta.url), "utf8");
    const sharingHelpers = source.slice(source.indexOf("function confirmedNick()"), source.indexOf("function describeFriendStatus("));
    const renderer = source.slice(source.indexOf("bt = () => {"), source.indexOf("var Bs ="));
    const elements = new Map();
    const copies = [];
    const code = "id-23456789ABCDabcd23456789";
    let directory = "pending";
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            classList: { toggle() {} },
            replaceChildren(...children) { this.content = children; },
            addEventListener(type, listener) { if (type === "click") this.click = listener; },
        });
        return elements.get(id);
    };
    const render = runInNewContext(`${sharingHelpers}\nvar ${renderer}\n bt`, {
        v: { nick: "local_test", name: "Local Test" },
        c: element, l: null, Ee: () => ({ friendCode: code }), pe: { get: () => null },
        Qt: { nickDirectoryStatus: () => directory, askNick: () => assert.fail("Unexpected nickname prompt") },
        dt: value => copies.push(value), Te() {}, Xt() {}, at: () => ({}), ne() {}, I: (tag, props) => props.text,
    });
    const preferred = ["w-id", "af-my", "s-nick"];
    render();
    preferred.forEach(id => element(id).click());
    assert.deepEqual(copies.splice(0), [code, code, code]);
    assert.equal(element("w-id").content[0], code);
    assert.match(element("w-share-status").textContent, /публикуется/i);

    directory = "unavailable";
    render();
    assert.match(element("af-share-status").textContent, /недоступен/i);
    element("s-nick").click();
    assert.deepEqual(copies.splice(0), [code]);

    directory = "published";
    render();
    preferred.forEach(id => element(id).click());
    element("s-friendcode").click();
    assert.deepEqual(copies, ["@local_test", "@local_test", "@local_test", code]);
    assert.equal(element("af-my").content[0], "@local_test");
});

test("zero relay acknowledgements keep a nick request queued", async t => {
    const app = await fixture(t, {
        query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [],
        publish: async event => ({ ok: event.kind === net.KIND_MAIL ? 0 : 1, failed: 0 }),
    });
    await app.start();
    assert.deepEqual(await app.account.addFriend("@remote_test"), { delivered: false });
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
});

test("a queued encrypted friend request retries after relay reconnection", async t => {
    let mailAttempts = 0;
    const app = await fixture(t, {
        query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [],
        publish: async event => {
            if (event.kind === net.KIND_MAIL && ++mailAttempts === 1) throw relayUnavailable();
            return { ok: 1, failed: 0 };
        },
    });
    await app.start();
    assert.deepEqual(await app.account.addFriend("@remote_test"), { delivered: false });
    app.intervals.get(8000)();
    await settle();
    assert.equal(mailAttempts, 1);
    app.setConnected(0);
    app.setConnected(1);
    await until(() => mailAttempts === 2);
    await settle();
    app.setConnected(0);
    app.setConnected(1);
    await settle();
    assert.equal(mailAttempts, 2);
    assert.deepEqual(app.legacyRequests, [remote.profile.code]);
});

test("cancelling a queued request prevents encrypted retries", async t => {
    let mailAttempts = 0;
    const app = await fixture(t, {
        query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [],
        publish: async event => {
            if (event.kind === net.KIND_MAIL) mailAttempts++;
            return { ok: event.kind === net.KIND_MAIL ? 0 : 1, failed: 0 };
        },
    });
    await app.start();
    assert.deepEqual(await app.account.addFriend("@remote_test"), { delivered: false });
    app.outgoing.length = 0;
    app.setConnected(0);
    app.setConnected(1);
    await settle();
    assert.equal(mailAttempts, 1);
    assert.equal(app.memory.get("friend-request-mail")?.length, 0);
});

test("an accepted request response retries after failed acknowledgement and does not prompt again", async t => {
    const contacts = [];
    let mailAttempts = 0;
    const app = await fixture(t, {
        contacts,
        publish: async event => ({ ok: event.kind === net.KIND_MAIL && ++mailAttempts === 1 ? 0 : 1, failed: 0 }),
    });
    await app.start();
    const remoteKey = await net.pairKey(remote.identity.dh.privateKey, local.identity.dhPub);
    const signRequest = () => net.mailEvent(remote.keys.nostr, local.profile.npub, remoteKey,
        { t: "req", profile: remote.profile }, [["k", remote.profile.dhPub]]);
    const inbox = app.subscriptions.find(sub => sub.filter.kinds?.[0] === net.KIND_MAIL);
    await inbox.onEvent(await signRequest());
    assert.equal(app.incoming.length, 1);
    contacts.push(remote.profile);
    await app.incoming[0].reply(true);
    assert.equal(mailAttempts, 1);
    app.setConnected(0);
    app.setConnected(1);
    await until(() => mailAttempts === 2);
    const response = await net.readMail(remoteKey, app.events.filter(event => event.kind === net.KIND_MAIL).at(-1));
    assert.equal(response.t, "res");
    assert.equal(response.accepted, true);
    assert.equal(response.profile.pub, local.profile.pub);
    await inbox.onEvent(await signRequest());
    await until(() => mailAttempts === 3);
    assert.equal(app.incoming.length, 1);
});

test("explicit nick search finds the exact profile outside the bulk directory", async t => {
    const app = await fixture(t, { query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [] });
    await app.start();
    const results = await app.search("@remote_test");
    assert.equal(results.some(result => result.class === "sr-item"), true);
    assert.equal(app.queries.some(filter => filter.limit === 2000), false);
});

test("editing a search removes the previous row before the debounced query", async t => {
    const app = await fixture(t, { query: async filter => filter["#n"]?.[0] === remote.profile.nick ? [remoteProfileEvent] : [] });
    await app.start();
    const initial = await app.search("@" + remote.profile.nick);
    const oldAdd = initial.find(result => result.class === "sr-item").children.find(child => child.tag === "button");
    const current = app.typeSearch("@someone_else");
    assert.equal(current.some(result => result.class === "sr-item"), false);
    await oldAdd.onclick({ currentTarget: oldAdd });
    assert.deepEqual(app.legacyRequests, []);
    assert.equal(app.searchValue(), "@someone_else");
});

test("an earlier Add request finishing does not erase a newer search", async t => {
    let acknowledge;
    const blockedMail = new Promise(resolve => { acknowledge = resolve; });
    const app = await fixture(t, {
        query: async filter => filter["#n"]?.[0] === remote.profile.nick ? [remoteProfileEvent] : [],
        publish: async event => event.kind === net.KIND_MAIL ? blockedMail : { ok: 1, failed: 0 },
    });
    await app.start();
    const initial = await app.search("@" + remote.profile.nick);
    const oldAdd = initial.find(result => result.class === "sr-item").children.find(child => child.tag === "button");
    const sending = oldAdd.onclick({ currentTarget: oldAdd });
    try {
        await until(() => app.events.some(event => event.kind === net.KIND_MAIL));
        await app.search("@someone_else");
    } finally {
        acknowledge({ ok: 1, failed: 0 });
        await sending;
    }
    assert.equal(app.searchValue(), "@someone_else");
});

test("a complete @nickname never displays a profile whose nickname only contains the query", async t => {
    const different = { ...remote.profile, nick: remote.profile.nick + "_other" };
    const differentProfile = net.profileEvent(remote.keys.nostr, different, 60);
    const app = await fixture(t, { query: async filter => filter["#t"]?.[0] === "pulse-user" && !filter["#n"] ? [differentProfile] : [] });
    await app.start();
    const actual = await app.search("@" + remote.profile.nick);
    assert.equal(actual.some(result => result.class === "sr-item"), false);
    assert.match(actual[0].text, /никого не нашли/);
});

test("a matching existing friend has no misleading network no-results label", async t => {
    const app = await fixture(t, { contacts: [remote.profile], query: async () => [] });
    await app.start();
    assert.deepEqual(await app.search("@remote_test"), []);
});

test("exact @nickname does not match an existing friend's display name", async t => {
    const app = await fixture(t, { contacts: [{ ...remote.profile, nick: "different_nick" }] });
    await app.start();
    const results = await app.search("@remote_test");
    assert.match(results[0]?.text ?? "", /никого не нашли/i);
});

test("search does not offer the user's own Pulse identity with a different relay key", async t => {
    const alias = net.profileEvent(net.newSecret(), { ...local.profile, nick: "former_nick" }, 60);
    const app = await fixture(t, { query: async filter => filter["#n"]?.[0] === "former_nick" ? [alias] : [] });
    await app.start();
    const results = await app.search("@former_nick");
    assert.equal(results.some(result => result.class === "sr-item"), false);
});

test("a registered nickname with an unavailable contact card is distinguished from an absent account", async t => {
    const vault = net.vaultEvent(remote.keys.nostr, remote.profile.nick, "synthetic-vault", 60);
    const app = await fixture(t, { query: async filter =>
        filter["#t"]?.includes("pulse-acct") && filter["#n"]?.includes(remote.profile.nick) ? [vault] : []
    });
    await app.start();
    assert.match((await app.search("@remote_test"))[0]?.text ?? "", /карточк.*недоступ/i);
    assert.match((await app.search("remote_test"))[0]?.text ?? "", /карточк.*недоступ/i);
    await assert.rejects(app.account.addFriend("@remote_test"), /карточк.*недоступ/i);
    assert.deepEqual(app.legacyRequests, []);
});

test("a confirmed empty exact lookup reports absence, but a partial lookup reports uncertainty", async t => {
    const partial = await partialResults([]);
    assert.equal(net.queryWasComplete(partial), false);
    let available = true;
    const app = await fixture(t, { query: async filter => {
        if (!available && filter["#n"]?.includes("missing_test")) return partial;
        return [];
    } });
    await app.start();
    assert.match((await app.search("@missing_test"))[0]?.text ?? "", /никого не нашли/i);
    available = false;
    const incomplete = (await app.search("@missing_test"))[0]?.text ?? "";
    assert.match(incomplete, /подключен|реле|сеть/i);
    assert.doesNotMatch(incomplete, /никого не нашли/i);
});

test("a signed legacy envelope with an unreadable card is reported as unavailable", async t => {
    const legacy = net.profileEvent(remote.keys.nostr, { ...remote.profile, code: "legacy-code" }, 60);
    const app = await fixture(t, { query: async filter => filter["#n"]?.includes(remote.profile.nick) ? [legacy] : [] });
    await app.start();
    assert.match((await app.search("@remote_test"))[0]?.text ?? "", /карточк.*недоступ/i);
});

test("a nickname reused by a different account does not replace the existing friend", async t => {
    const replacement = await makeIdentity(remote.profile.nick);
    const newProfile = net.profileEvent(replacement.keys.nostr, replacement.profile, 61);
    const original = { ...remote.profile };
    const app = await fixture(t, {
        contacts: [original],
        query: async filter => filter["#n"]?.includes(remote.profile.nick) ? [newProfile] : [],
    });
    await app.start();
    const row = (await app.search("@remote_test")).find(result => result.class === "sr-item");
    assert.ok(row, "the new identity is available as its own request");
    const addButton = row.children.find(child => child.tag === "button");
    await addButton.onclick({ currentTarget: addButton });
    assert.deepEqual(original, remote.profile);
    assert.deepEqual(app.legacyRequests, [replacement.profile.code]);
    assert.ok(app.events.some(event => event.kind === net.KIND_MAIL
        && event.tags.some(([type, value]) => type === "p" && value === replacement.profile.npub)));
});

test("failed search shows network status and a repeat finds a newly reachable directory", async t => {
    let available = false;
    const app = await fixture(t, { query: async filter => {
        if (!available) throw relayUnavailable();
        return filter["#t"]?.[0] === "pulse-user" ? [remoteProfileEvent] : [];
    } });
    await app.start();
    const failure = await app.search("remote te");
    assert.match(failure[0].text, /подключен|реле|сеть/i);
    available = true;
    assert.equal((await app.search("remote_")).some(result => result.class === "sr-item"), true);
});

test("profile and public room publication retry only after failed acknowledgements", async t => {
    const counts = new Map();
    const roomCode = "pulse-11111111111111111111";
    const app = await fixture(t, {
        rooms: [{ code: roomCode, name: "Test Room", pub: true }],
        publish: async event => {
            const address = eventAddress(event);
            counts.set(address, (counts.get(address) ?? 0) + 1);
            return { ok: counts.get(address) > 1 ? 1 : 0, failed: 0 };
        },
    });
    await app.start();
    const room = await net.roomId(roomCode);
    await until(() => counts.get("pulse-profile") === 1 && counts.get(`pulse-room:${room}`) === 1);
    app.intervals.get(8000)();
    await until(() => counts.get("pulse-profile") === 2 && counts.get(`pulse-room:${room}`) === 2);
    app.intervals.get(8000)();
    await settle();
    assert.equal(counts.get("pulse-profile"), 2);
    assert.equal(counts.get(`pulse-room:${room}`), 2);
});

test("an additional relay receives the profile, vault, and room after the initial acknowledgements", async t => {
    const roomCode = "pulse-11111111111111111111";
    const directoryAddresses = ["pulse-profile", "pulse-acct", `pulse-room:${await net.roomId(roomCode)}`];
    const received = [new Set(), new Set()];
    let secondRelayOpen = false;
    const app = await fixture(t, {
        stored: { vault: { nick: "local_test", sealed: "synthetic-vault" } },
        rooms: [{ code: roomCode, name: "Test Room", pub: true }],
        publish: async event => {
            received[0].add(eventAddress(event));
            if (secondRelayOpen) received[1].add(eventAddress(event));
            return { ok: 1, failed: 0 };
        },
    });
    await app.start();
    await until(() => directoryAddresses.every(address => received[0].has(address)));
    assert.equal(received[1].size, 0);
    secondRelayOpen = true;
    app.setConnected(2);
    await until(() => directoryAddresses.every(address => received[1].has(address)));
});

test("account relay selection follows bootstrap preference then migrated account settings", async t => {
    const app = await fixture(t, {
        settings: { relays: ["wss://account.test/"] },
        storage: { "pulse:networkRelays": JSON.stringify(["wss://bootstrap.test/"]) },
    });
    const urls = () => app.account.getPool().relays.map(relay => relay.url);
    assert.deepEqual(urls().map(url => new URL(url).host), ["bootstrap.test"]);
    await app.start();
    assert.deepEqual(urls().map(url => new URL(url).host), ["account.test"]);
    assert.deepEqual(JSON.parse(app.device.get("pulse:networkRelays")).map(url => new URL(url).host), ["account.test"]);
});

test("reconnect hydrates a legacy friend with matching keys and subscribes to presence", async t => {
    let available = false;
    const contact = { ...remote.profile, npub: undefined };
    const app = await fixture(t, {
        contacts: [contact], connected: 0,
        query: async filter => {
            if (!available) throw relayUnavailable();
            return filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [];
        },
    });
    await app.start();
    assert.equal(contact.npub, undefined);
    available = true;
    app.setConnected(1);
    await until(() => contact.npub === remote.profile.npub && app.subscriptions.some(sub => sub.filter.authors?.includes(remote.profile.npub)));
});

test("friend hydration keeps existing friendship tied to its original identity", async t => {
    const contact = { ...remote.profile, npub: undefined, code: local.profile.code, pub: local.profile.pub, dhPub: local.profile.dhPub };
    const app = await fixture(t, { contacts: [contact], query: async filter => filter["#t"]?.[0] === "pulse-user" ? [remoteProfileEvent] : [] });
    await app.start();
    await until(() => app.queries.some(filter => filter["#t"]?.[0] === "pulse-user"));
    assert.equal(contact.npub, undefined);
});

test("a contact proof can refresh a friend's relay key without changing the friendship or accepting an older proof", async t => {
    let clock = Date.now();
    t.mock.method(Date, "now", () => clock);
    const oldCard = await net.contactEvent(remote.keys.nostr, remote.profile, remote.identity.pair.privateKey);
    const secret = net.newSecret();
    clock += 2_000;
    const replacement = { ...remote.profile, npub: net.pubOf(secret) };
    const newCard = await net.contactEvent(secret, replacement, remote.identity.pair.privateKey);
    const contact = { ...remote.profile };
    let record = newCard;
    const app = await fixture(t, {
        contacts: [contact],
        query: async filter => filter["#d"]?.includes(eventAddress(record)) ? [record] : [],
    });
    await app.start();
    await until(() => app.subscriptions.some(sub => sub.filter.authors?.includes(replacement.npub)));
    assert.equal(contact.npub, replacement.npub);
    assert.equal(contact.pub, remote.profile.pub);
    assert.equal(contact.code, remote.profile.code);
    assert.equal(app.subscriptions.some(sub => sub.filter.authors?.includes(remote.profile.npub)), false);

    record = oldCard;
    clock += 60_000;
    const before = app.queries.length;
    app.intervals.get(60_000)();
    await until(() => app.queries.slice(before).some(query => query["#d"]?.includes(eventAddress(oldCard))));
    await settle();
    assert.equal(contact.npub, replacement.npub);
});

test("the first heartbeat is sent before a delayed cloud restore completes", async t => {
    let release;
    const cloud = new Promise(resolve => { release = resolve; });
    const app = await fixture(t, {
        query: async filter => filter["#d"]?.includes("pulse-sync") ? cloud : [],
    });
    const starting = app.start();
    try {
        await until(() => app.events.some(event => eventAddress(event) === "pulse-presence"));
    } finally {
        release([]);
        await starting;
    }
});

test("a rejected heartbeat is retried on an open relay before the next normal heartbeat", async t => {
    let accept = false;
    const app = await fixture(t, {
        publish: async event => ({ ok: accept || eventAddress(event) !== "pulse-presence" ? 1 : 0, failed: 0 }),
    });
    await app.start();
    await settle();
    const heartbeats = () => app.events.filter(event => eventAddress(event) === "pulse-presence");
    assert.equal(heartbeats().length, 1);
    accept = true;
    app.intervals.get(8_000)();
    await until(() => heartbeats().length === 2);
});

test("a forged heartbeat is ignored while a signed heartbeat reaches the friend store", async t => {
    const app = await fixture(t, { contacts: [remote.profile] });
    await app.start();
    const subscription = app.subscriptions.find(sub => sub.filter.authors?.includes(remote.profile.npub));
    const genuine = net.presenceEvent(remote.keys.nostr);
    subscription.onEvent({ ...genuine, sig: "0".repeat(128) });
    subscription.onEvent(genuine);
    assert.deepEqual(app.presences, [[remote.profile.pub, genuine.created_at * 1000, true, genuine.id]]);
});

test("explicit logout persists a newer signed offline event and stops heartbeats", async t => {
    t.mock.method(Date, "now", () => 1_800_000_000_000);
    const app = await fixture(t);
    await app.start();
    const timer = app.intervals.get(45_000);
    await app.account.goOffline?.();
    timer();
    app.intervals.get(8_000)();
    await settle();
    const events = app.events.filter(event => /^pulse-presence(?:-offline)?$/.test(eventAddress(event)));
    assert.equal(events.length, 2);
    assert.equal(events[0].content, "");
    assert.equal(events[1].content, "offline");
    assert.equal(net.readPresence(events[1])?.online, false);
    assert.equal(events[1].pubkey, events[0].pubkey);
    assert.ok(events[1].created_at > events[0].created_at);
});

test("the friend status refreshes when a signed offline record expires to unknown", async t => {
    let state = "offline";
    const app = await fixture(t, { contacts: [remote.profile], presenceStatus: () => state });
    await app.start();
    await settle();
    const before = app.renders;
    state = "unknown";
    app.intervals.get(8_000)();
    assert.ok(app.renders > before);
});

test("logging in within the same second advances the saved offline timestamp for that identity", async t => {
    const now = 1_800_000_000;
    t.mock.method(Date, "now", () => now * 1000);
    const app = await fixture(t, { stored: { presenceTimestamp: { npub: local.profile.npub, at: now + 1 } } });
    await app.start();
    const event = app.events.find(event => eventAddress(event) === "pulse-presence");
    assert.equal(event.created_at, now + 2);
    assert.equal(event.content, "");
});

test("a different account publishes under its own relay key without reusing the previous timestamp", async t => {
    const now = 1_800_000_000;
    t.mock.method(Date, "now", () => now * 1000);
    const app = await fixture(t, {
        person: remote,
        stored: { presenceTimestamp: { npub: local.profile.npub, at: now + 1 } },
    });
    await app.start();
    const event = app.events.find(event => eventAddress(event) === "pulse-presence");
    assert.equal(event.created_at, now);
    assert.equal(event.pubkey, remote.profile.npub);
    assert.equal(net.readPresence(event)?.online, true);
});

test("a failed cloud restore blocks snapshot publication until the remote data is merged", async t => {
    let available = false;
    const remoteSnapshot = await net.syncEvent(local.keys.nostr, { v: 1, friends: [remote.profile], out: [], declined: [], rooms: [], profile: {} });
    const app = await fixture(t, { query: async filter => {
        if (filter["#d"]?.[0] !== "pulse-sync") return [];
        if (!available) throw relayUnavailable();
        return [remoteSnapshot];
    } });
    await app.start();
    app.intervals.get(8000)();
    await until(() => app.queries.filter(filter => filter["#d"]?.[0] === "pulse-sync").length >= 2);
    await settle();
    assert.equal(app.events.some(event => eventAddress(event) === "pulse-sync"), false);
    available = true;
    app.intervals.get(8000)();
    await until(() => app.events.some(event => eventAddress(event) === "pulse-sync"));
    const event = app.events.find(event => eventAddress(event) === "pulse-sync");
    const actual = await net.fetchSync({ query: async () => [event] }, local.keys.nostr);
    assert.equal(actual.data.friends[0].pub, remote.profile.pub);
});

test("an incomplete cloud restore does not resurrect contacts removed from the complete snapshot", async t => {
    const remoteSnapshot = await net.syncEvent(local.keys.nostr, { v: 1, friends: [remote.profile], out: [], declined: [], rooms: [], profile: {} });
    const anotherFriend = await makeIdentity("other_contact");
    const fullSnapshot = await net.syncEvent(local.keys.nostr, { v: 1, friends: [anotherFriend.profile], out: [], declined: [], rooms: [], profile: {} });
    const partial = await partialResults([remoteSnapshot]);
    const contacts = [];
    let complete = false;
    const app = await fixture(t, {
        contacts,
        query: async filter => filter["#d"]?.includes("pulse-sync") ? (complete ? [fullSnapshot] : partial) : [],
    });
    await app.start();
    assert.equal(contacts.length, 0);
    app.intervals.get(8_000)();
    await until(() => app.queries.filter(filter => filter["#d"]?.includes("pulse-sync")).length >= 2);
    await settle();
    assert.equal(app.events.some(event => eventAddress(event) === "pulse-sync"), false);
    complete = true;
    await until(() => {
        if (app.events.some(event => eventAddress(event) === "pulse-sync")) return true;
        app.intervals.get(8_000)();
        return false;
    });
    const uploaded = app.events.find(event => eventAddress(event) === "pulse-sync");
    const restored = await net.fetchSync({ query: async () => [uploaded] }, local.keys.nostr);
    assert.deepEqual(restored.data.friends.map(friend => friend.pub), [anotherFriend.profile.pub]);
});

test("an offline-created profile waits for nickname verification and vault acknowledgement", async t => {
    let available = false;
    let accepting = false;
    const app = await fixture(t, {
        stored: { vault: { nick: "local_test", sealed: "synthetic-vault", pending: true, checkNick: true } },
        query: async filter => {
            if (filter["#n"]?.[0] === "local_test" && !available) throw relayUnavailable();
            return [];
        },
        publish: async event => ({ ok: accepting || eventAddress(event) !== "pulse-acct" ? 1 : 0, failed: 0 }),
    });
    await app.start();
    await settle();
    assert.equal(app.events.some(event => eventAddress(event) === "pulse-profile"), false);
    available = true;
    app.intervals.get(8000)();
    await until(() => app.events.some(event => eventAddress(event) === "pulse-acct"));
    assert.equal(app.events.some(event => eventAddress(event) === "pulse-profile"), false);
    accepting = true;
    app.intervals.get(8000)();
    await until(() => app.events.some(event => eventAddress(event) === "pulse-profile"));
    assert.equal(app.memory.get("vault").pending, undefined);
    assert.equal(app.memory.get("vault").checkNick, undefined);
});

test("an offline-created nickname already claimed by another account prompts once and stays unpublished", async t => {
    const owner = net.profileEvent(remote.keys.nostr, { ...remote.profile, nick: "local_test" }, 60);
    const app = await fixture(t, {
        stored: { vault: { nick: "local_test", sealed: "synthetic-vault", pending: true, checkNick: true } },
        query: async filter => filter["#t"]?.[0] === "pulse-user" && filter["#n"]?.[0] === "local_test" ? [owner] : [],
    });
    await app.start();
    await until(() => app.openedModals.length === 1);
    app.intervals.get(8000)();
    await settle();
    assert.deepEqual(app.openedModals, ["nick-modal"]);
    assert.match(app.notices[0], /занят/i);
    assert.equal(app.events.some(event => ["pulse-acct", "pulse-profile"].includes(eventAddress(event))), false);
});

test("room invitation mail accepts one fresh encrypted invite from an existing friend", async t => {
    const app = await fixture(t, { contacts: [remote.profile] });
    await app.start();
    const invite = { code: "pulse-11111111111111111111", name: "Test Room" };
    assert.equal(await app.account.mail.invite(remote.profile, invite), true);
    const outbound = app.events.find(event => event.kind === net.KIND_MAIL);
    const remoteKey = await net.pairKey(remote.identity.dh.privateKey, local.identity.dhPub);
    const content = await net.readMail(remoteKey, outbound);
    assert.equal(content.t, "invite");
    assert.equal(content.code, invite.code);
    assert.equal(content.name, invite.name);
    assert.equal(Number.isSafeInteger(content.at), true);

    const inbox = app.subscriptions.find(sub => sub.filter.kinds?.[0] === net.KIND_MAIL);
    const incoming = await net.mailEvent(remote.keys.nostr, local.profile.npub, remoteKey, content);
    const stale = await net.mailEvent(remote.keys.nostr, local.profile.npub, remoteKey, { ...content, at: content.at - 24 * 60 * 60 });
    const malformed = await net.mailEvent(remote.keys.nostr, local.profile.npub, remoteKey, { ...content, code: `invite ${content.code}` });
    inbox.onEvent(incoming);
    inbox.onEvent(incoming);
    inbox.onEvent(stale);
    inbox.onEvent(malformed);
    await until(() => app.invitations.length > 0);
    await wait(15);
    assert.deepEqual(app.invitations, [[remote.profile, invite]]);
});

test("a migrated account uses its relay identity for contact discovery and presence while keeping cloud backup disabled", async t => {
    const contact = { ...remote.profile, npub: undefined };
    const app = await fixture(t, {
        legacy: true, settings: { nick: undefined }, contacts: [contact],
        stored: { vault: { nick: "local_test", sealed: "synthetic-vault", pending: true } },
        rooms: [{ code: "pulse-11111111111111111111", name: "Test Room", pub: true }],
        query: async filter => filter["#n"]?.[0] === "remote_test" ? [remoteProfileEvent] : [],
    });
    await app.start();
    await until(() => app.subscriptions.some(sub => sub.filter.authors?.includes(remote.profile.npub)));
    assert.equal(app.accountSettings.npub, net.pubOf(app.memory.get("legacyNostr")));
    assert.equal(app.events.some(event => eventAddress(event) === "pulse-presence" && event.pubkey === app.accountSettings.npub), true);
    assert.deepEqual(await app.search("@remote_test"), []);
    assert.equal(app.queries.some(filter => filter["#n"]?.[0] === "remote_test"), true);
    app.intervals.get(8000)();
    await settle();
    const addresses = app.events.map(eventAddress);
    assert.equal(addresses.some(address => address.startsWith("pulse-contact:")), true);
    assert.equal(addresses.every(address => address === "pulse-presence" || address.startsWith("pulse-contact:")), true);
    assert.equal(app.subscriptions.some(sub => sub.filter.kinds?.includes(net.KIND_MAIL)), true);
    assert.equal(app.queries.some(filter => filter["#d"]?.includes("pulse-sync")), false);
});
