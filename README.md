# nostr-resilient-pool

A resilient pool for nostr-tools that tolerates NIP-46 relay failures.

## Problem

When using `SimplePool` from nostr-tools with NIP-46 bunker connections, if any relay in the bunker URI fails to connect, the entire connection fails. This is problematic when bunker URIs include multiple relays for redundancy.

## Solution

`ResilientPool` extends `AbstractSimplePool` and uses `Promise.allSettled` instead of `Promise.all` for relay connections. This allows connections to proceed as long as at least one relay (or a configurable minimum) is responsive.

## Installation

```bash
npm install nostr-resilient-pool
```

## Usage

```typescript
import { ResilientPool } from 'nostr-resilient-pool'
import { BunkerSigner } from 'nostr-tools/nip46'

// Create a resilient pool
const pool = new ResilientPool({
  maxWaitForConnection: 10_000,
  minSuccessfulRelays: 1, // default
  onRelayConnectionFailure: (url) => console.warn(`Relay failed: ${url}`),
  onPartialSuccess: (ok, failed) => {
    console.log(`Connected via ${ok.length} relay(s), ${failed.length} failed`)
  },
})

// Use with BunkerSigner
const signer = BunkerSigner.fromBunker(clientSecret, bunkerParams, { pool })
await signer.connect()
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minSuccessfulRelays` | `number` | `1` | Minimum relays that must connect successfully |
| `maxWaitForConnection` | `number` | `10000` | Max time (ms) to wait for relay connections |
| `onRelayConnectionFailure` | `(url: string) => void` | - | Called when a relay fails to connect |
| `onRelayConnectionSuccess` | `(url: string) => void` | - | Called when a relay connects successfully |
| `onPartialSuccess` | `(ok: string[], failed: string[]) => void` | - | Called when some relays succeed and some fail |

## How it works

### Subscriptions

Connects to all relays in parallel using `Promise.allSettled`. If ≥`minSuccessfulRelays` connect successfully, the subscription proceeds. Failed relays are logged but don't abort the operation.

### EOSE Handling

The `oneose` callback is triggered when all *successfully connected* relays have sent their EOSE (End of Stored Events) message, not all relays including failed ones.

### Publish

The `publish` method returns an array of promises (same as `SimplePool`). Use `publishResilient` for a more convenient API that waits for enough relays to succeed:

```typescript
const { successful, failed } = await pool.publishResilient(relays, event)
```

## License

MIT
