# VDO.Ninja SDK 1.6.2

Pulse bundles the unmodified browser JavaScript and corresponding source from
the official [npm release](https://www.npmjs.com/package/@vdoninja/sdk/v/1.6.2).
See LICENSE and LICENSING.md for the Mozilla Public License 2.0 and notices.

| File | SHA-256 |
| --- | --- |
| vdoninja-sdk.js | cd295ad295713ca14b6c4cded2380ccd2e663952abd33bc43a76a4986a59e5ee |
| vdoninja-sdk.min.js | 5b2f9f0800c398026e4ca92cda40a0a01069b42d6f4c504dfbcb9027e97a0934 |

The SDK supplies WebRTC signaling and TURN for the active voice room. Pulse
authenticates an account on the specific RTC data channel for each direction
before attaching the processed microphone. The SDK version is pinned because
the peer-connected event exposes the underlying peer connection and its
control channel in this release. Recheck that binding when upgrading.

