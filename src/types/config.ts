import Memcached from 'memcached'

export interface Config<Context> {
  /**
   * Memcached instance to use as cache storage
   */
  memcached: Memcached

  /**
   * Set the namespace to attach to the front of the cache key based on context
   */
  contextKey: ContextKeyFunction<Context>

  /**
   * Triggered before cache fetching
   * @param {string} key Cache key
   */
  beforeGet?: LifeCycleHook

  /**
   * Triggered after cache fetching
   * @param {string} key Cache key
   * @param {Object} [data] Cached item
   */
  afterGet?: LifeCycleHook

  /**
   * Triggered before cache storing
   * @param {string} key Cache key
   * @param {Object} [data] item
   */
  beforeSave?: LifeCycleHook

  /**
   * Triggered after cache storing
   * @param {string} key Cache key
   * @param {Object} [data] Serialized item
   */
  afterSave?: LifeCycleHook

  /**
   * Triggered when cache hit
   * @param {string} key Cache key
   * @param {Object} [data] Serialized item
   */
  onHit?: LifeCycleHook

  /**
   * Triggered when cache miss
   * @param {string} key Cache key
   * @param {Object} [data] Serialized item
   */
  onMiss?: LifeCycleHook
}

export type ContextKeyFunction<Context> = (context: Context) => string

export type LifeCycleHook = (key: string, data: any | null) => void
