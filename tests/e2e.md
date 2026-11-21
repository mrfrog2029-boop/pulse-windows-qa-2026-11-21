# Pulse loopback regression test

Run these PowerShell commands from the Pulse directory with Node.js, Chrome or Edge, and OpenSSL available. The script detects Edge, Chrome, and the OpenSSL executable bundled with Git for Windows in their standard locations. Give it alternative paths with `--browser` and `--openssl`.

```powershell
$pulseDeps = Join-Path $env:TEMP 'Pulse-Acceptance-Deps-20261120'
npm install --prefix $pulseDeps --no-audit --no-fund --ignore-scripts playwright-core@1.65.1 ws@8.23.0
node .\tests\e2e.mjs --deps $pulseDeps --mode custom --join both
node .\tests\e2e.mjs --deps $pulseDeps --mode bootstrap --join code
node .\tests\e2e.mjs --deps $pulseDeps --mode custom --presence --join code
```

The script tests the sibling `web` directory by default. To test packaged assets, extract the directory containing `index.html` and pass it with `--root`.

- `custom` creates two synthetic accounts using a local relay fixture. Both profiles save the loopback relay through Settings and reload with all bundled relay endpoints unavailable. The test verifies account traffic uses the configured relay after reload.
- `bootstrap` preconfigures the device relay setting before fresh onboarding. The loopback relay serves both accounts from their first request.
- `default` redirects the bundled relay sockets to the same local fixture. This mode can exercise basic networking on original builds before custom relay support.

Each mode verifies remote discovery by exact @nick, a sent and accepted friend request, mutual online status, filtering the existing friend by exact @nick, and two named participants in the same private room. The join option can exercise the invitation button, a room code, or both. In each room the script sends a text message in each direction.

Add `--presence` to interrupt delivery of WebRTC signaling after the profiles have friended each other. The test reloads both profiles, confirms fresh kind-30078 heartbeats and both online indicators while native ICE stays disconnected, closes one client, and advances the other browser's app clock past the heartbeat expiry. It restores signaling and reopens the existing profile before the room test.

The app runs in two fresh headless Chromium contexts with a local HTTPS/WSS fixture and fake audio devices. WebRTC uses real peer connections with external STUN and TURN disabled. The relay keeps profile and mail events in memory and delivers signaling live. The harness confines all browser requests and relay writes to this fixture.

## Public relay acceptance

`live-e2e.mjs` requires explicit `--live` and publishes two new synthetic Pulse profiles to the relays configured by the selected bundle. Use `--root` to choose an extracted release. Browser contexts and passwords are disposable, and Chromium supplies synthetic microphone input. The harness uses real WSS and standard TLS validation and summarizes Nostr acknowledgements, search timing, and ICE without recording credentials or network addresses.

```powershell
node .\tests\live-e2e.mjs --live --deps $pulseDeps --add id --join both
node .\tests\live-e2e.mjs --live --deps $pulseDeps --add nick --sender bob --join both
node .\tests\live-e2e.mjs --live --deps $pulseDeps --add id --join both --no-direct
node .\tests\live-e2e.mjs --live --deps $pulseDeps --join code --turn-only
node .\tests\live-e2e.mjs --live --deps $pulseDeps --join both --all-transports
```

Each run attempts directory search by displayed ID and @nick in both directions, then adds the other synthetic profile by the selected method. A private room can still be tested by code if the social path fails. The `--no-direct` case requires native ICE to remain disconnected by using an ICE relay-only policy with an empty server list. Public WSS stays active, so a completed room test verifies two participants and chat in both directions through the application's relay transport.

`--turn-only` applies the relay-only ICE policy while preserving the app's ICE server configuration. It requires both authenticated participants to show the voice-and-chat status, each selected ICE pair to be nominated TURN on both ends, and each incoming audio packet counter to increase. The room UI sends text in both directions. `--all-transports` exercises the standard and restricted modes in order, reopening the same pair of isolated profiles between them.

