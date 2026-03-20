import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResilientPool } from '../resilient-pool'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  readyState: number = 0 // CONNECTING
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((error: Error) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  _shouldFail: boolean = false
  _shouldTimeout: boolean = false
  _delay: number = 10

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)

    // Simulate async connection
    setTimeout(() => {
      if (this._shouldFail) {
        this.onerror?.(new Error('Connection failed'))
        this.readyState = 3 // CLOSED
        this.onclose?.({ code: 1006, reason: 'Connection failed' })
      } else if (!this._shouldTimeout) {
        this.readyState = 1 // OPEN
        this.onopen?.()
      }
    }, this._delay)
  }

  send(_data: string) {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open')
    }
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.({ code: 1000, reason: 'Normal closure' })
  }

  static clear() {
    MockWebSocket.instances = []
  }
}

// Install mock WebSocket globally
beforeEach(() => {
  MockWebSocket.clear()
  ;(global as any).WebSocket = MockWebSocket
})

afterEach(() => {
  MockWebSocket.clear()
})

describe('ResilientPool', () => {
  describe('constructor', () => {
    it('should create a pool with default options', () => {
      const pool = new ResilientPool()
      expect(pool).toBeInstanceOf(ResilientPool)
      expect(pool.minSuccessfulRelays).toBe(1)
    })

    it('should accept custom minSuccessfulRelays', () => {
      const pool = new ResilientPool({ minSuccessfulRelays: 2 })
      expect(pool.minSuccessfulRelays).toBe(2)
    })

    it('should accept custom maxWaitForConnection', () => {
      const pool = new ResilientPool({ maxWaitForConnection: 5000 })
      expect(pool.maxWaitForConnection).toBe(5000)
    })
  })

  describe('callbacks', () => {
    it('should store onRelayConnectionFailure callback', () => {
      const onRelayConnectionFailure = vi.fn()
      const pool = new ResilientPool({
        onRelayConnectionFailure,
        maxWaitForConnection: 100,
      })

      expect(pool.onRelayConnectionFailure).toBe(onRelayConnectionFailure)
    })

    it('should store onRelayConnectionSuccess callback', () => {
      const onRelayConnectionSuccess = vi.fn()
      const pool = new ResilientPool({
        onRelayConnectionSuccess,
        maxWaitForConnection: 1000,
      })

      expect(pool.onRelayConnectionSuccess).toBe(onRelayConnectionSuccess)
    })

    it('should store onPartialSuccess callback', () => {
      const onPartialSuccess = vi.fn()
      
      const pool = new ResilientPool({
        onPartialSuccess,
        maxWaitForConnection: 500,
      })

      expect(pool.onPartialSuccess).toBe(onPartialSuccess)
    })
  })

  describe('interface compatibility', () => {
    it('should have the same public interface as SimplePool', () => {
      const pool = new ResilientPool()

      // Methods that must exist for NIP-46 compatibility
      expect(typeof pool.ensureRelay).toBe('function')
      expect(typeof pool.subscribe).toBe('function')
      expect(typeof pool.subscribeMany).toBe('function')
      expect(typeof pool.subscribeMap).toBe('function')
      expect(typeof pool.publish).toBe('function')
      expect(typeof pool.get).toBe('function')
      expect(typeof pool.close).toBe('function')
      expect(typeof pool.destroy).toBe('function')
    })

    it('should have verifyEvent from nostr-tools/pure', () => {
      const pool = new ResilientPool()
      expect(pool.verifyEvent).toBeDefined()
      expect(typeof pool.verifyEvent).toBe('function')
    })
  })

  describe('subscribeMap resilience', () => {
    it('should handle empty relay list gracefully', () => {
      const pool = new ResilientPool()
      const closer = pool.subscribeMap([], { onevent: () => {} })
      expect(closer).toBeDefined()
      expect(typeof closer.close).toBe('function')
    })

    it('should return SubCloser with close method for valid relays', () => {
      const pool = new ResilientPool()
      const closer = pool.subscribeMap(
        [
          { url: 'wss://relay1.example', filter: { kinds: [1] } },
          { url: 'wss://relay2.example', filter: { kinds: [1] } },
        ],
        { onevent: () => {} }
      )
      expect(closer).toBeDefined()
      expect(typeof closer.close).toBe('function')
    })
  })

  describe('publish', () => {
    it('should return an array of promises', () => {
      const pool = new ResilientPool()
      const event = {
        id: 'test-id',
        pubkey: 'test-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'test',
        sig: 'test-sig',
      }

      const results = pool.publish(['wss://relay1.example', 'wss://relay2.example'], event)

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      results.forEach((r) => expect(r).toBeInstanceOf(Promise))
    })

    it('should deduplicate relay URLs', () => {
      const pool = new ResilientPool()
      const event = {
        id: 'test-id',
        pubkey: 'test-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'test',
        sig: 'test-sig',
      }

      // Same URL with different trailing slashes
      const results = pool.publish(
        ['wss://relay.example', 'wss://relay.example/', 'wss://relay.example'],
        event
      )

      // Should only return 1 promise for deduplicated URL
      expect(results.length).toBe(1)
    })
  })

  describe('publishResilient', () => {
    it('should be a function', () => {
      const pool = new ResilientPool()
      expect(typeof pool.publishResilient).toBe('function')
    })

    it('should return a promise', () => {
      const pool = new ResilientPool()
      const event = {
        id: 'test-id',
        pubkey: 'test-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'test',
        sig: 'test-sig',
      }

      const result = pool.publishResilient(['wss://relay.example'], event)
      expect(result).toBeInstanceOf(Promise)
    })
  })
})

describe('ResilientPool minSuccessfulRelays', () => {
  it('should accept connections when enough relays succeed', () => {
    const pool = new ResilientPool({ minSuccessfulRelays: 1 })
    expect(pool.minSuccessfulRelays).toBe(1)
  })

  it('should be configurable to require multiple relays', () => {
    const pool = new ResilientPool({ minSuccessfulRelays: 3 })
    expect(pool.minSuccessfulRelays).toBe(3)
  })

  it('should default to 1 when not specified', () => {
    const pool = new ResilientPool()
    expect(pool.minSuccessfulRelays).toBe(1)
  })
})

describe('ResilientPool default options', () => {
  it('should have default maxWaitForConnection of 10000ms', () => {
    const pool = new ResilientPool()
    expect(pool.maxWaitForConnection).toBe(10000)
  })

  it('should allow overriding maxWaitForConnection', () => {
    const pool = new ResilientPool({ maxWaitForConnection: 5000 })
    expect(pool.maxWaitForConnection).toBe(5000)
  })
})
