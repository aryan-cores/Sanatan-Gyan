// config/cache.js
// ---------------------------------------------------------------------------
// Centralised in-memory cache (Point 5: Performance Optimization).
//
// Wraps `node-cache` so the rest of the codebase only ever talks to a tiny,
// predictable API (`get`, `set`, `del`, `wrap`, `delByPrefix`). This makes it
// trivial to swap the underlying store for Redis later (only this file would
// need to change) without touching any route handlers.
//
// Usage:
//   const cache = require('../config/cache');
//   const data = await cache.wrap('posts:page1', 30, async () => fetchFromDb());
//   cache.delByPrefix('posts:'); // call after any write that invalidates the feed
// ---------------------------------------------------------------------------

const NodeCache = require('node-cache');

// stdTTL: default time-to-live in seconds for every key (can be overridden per key).
// checkperiod: how often expired keys are swept from memory.
// useClones:false avoids the (fairly expensive) deep-clone node-cache does by
// default on every get/set — safe here because callers never mutate cached
// objects in place (they always receive fresh JSON-serialisable payloads).
const store = new NodeCache({
  stdTTL: 30,
  checkperiod: 60,
  useClones: false
});

/**
 * get(key) -> value | undefined
 */
function get(key) {
  return store.get(key);
}

/**
 * set(key, value, ttlSeconds?) -> boolean
 */
function set(key, value, ttlSeconds) {
  if (typeof ttlSeconds === 'number') {
    return store.set(key, value, ttlSeconds);
  }
  return store.set(key, value);
}

/**
 * del(key|key[]) -> number of deleted keys
 */
function del(key) {
  return store.del(key);
}

/**
 * delByPrefix(prefix) — invalidate every cached key that starts with `prefix`.
 * Used after create/update/delete operations so stale data is never served
 * for longer than necessary (e.g. `cache.delByPrefix('feed:posts:')`).
 */
function delByPrefix(prefix) {
  const keys = store.keys().filter((k) => k.startsWith(prefix));
  if (keys.length) store.del(keys);
  return keys.length;
}

/**
 * wrap(key, ttlSeconds, producerFn) — read-through cache helper.
 * If `key` is cached, resolves instantly with the cached value.
 * Otherwise calls `producerFn()`, caches the (awaited) result, and returns it.
 */
async function wrap(key, ttlSeconds, producerFn) {
  const cached = store.get(key);
  if (cached !== undefined) return cached;

  const fresh = await producerFn();
  // Never cache empty/undefined results for longer than a beat — avoids
  // "poisoning" the cache with a transient empty response.
  store.set(key, fresh, fresh === undefined || fresh === null ? 1 : ttlSeconds);
  return fresh;
}

function flushAll() {
  store.flushAll();
}

function stats() {
  return store.getStats();
}

module.exports = { get, set, del, delByPrefix, wrap, flushAll, stats };
