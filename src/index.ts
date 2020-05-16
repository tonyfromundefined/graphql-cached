import DataLoader from 'dataloader'
import { GraphQLResolveInfo } from 'graphql'
import Memcached from 'memcached'
import util from 'util'

const MINUTE = 1000 * 60

interface Resolvers {
  [typename: string]: TypeResolver | undefined
}
type TypeResolver = {
  [fieldName: string]: FieldResolver | undefined
}
type FieldResolver = (parent: any, args: any, context: any, info: any) => any

export interface CacheConfiguration {
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
   * Log hit ratio by 5 minutes
   */
  logger?:
    | true
    | {
        interval: number
      }
}

type ContextKeyFunction<Context> = (context: Context) => string
type LifeCycleHook = (key: string, data: any | null) => void

type Types<R> = {
  [TypeName in keyof R]?: {
    [FieldName in keyof R[TypeName]]?: {
      /**
       * Create a cache key by combining parent, args, and context.
       * @param {Object} parent
       * @param {Object} args
       * @param {Object} context
       * @param {Object} info
       */
      key: (
        parent: Parameters<R[TypeName][FieldName]>[0],
        args: Parameters<R[TypeName][FieldName]>[1],
        context: Parameters<R[TypeName][FieldName]>[2],
        info: Parameters<R[TypeName][FieldName]>[3]
      ) => string

      /**
       * How much time to keep the cache (seconds)
       */
      lifetime: number

      /**
       * Preprocess item before storing in cache and after fetching from cache
       */
      serializer?: {
        /**
         * Preprocess item before storing it in the cache
         * @param {Object} item
         * @returns {Object} Serialized item
         */
        serialize(item: any): any

        /**
         * Preprocess item after fetching from cache
         * @param {Object} Serialized item
         * @returns {Object} Item
         */
        deserialize(serializedItem: any): any
      }
    }
  }
}

export function cached<R extends Resolvers>(
  types: Types<Required<R>>,
  config: CacheConfiguration
) {
  /**
   * Initialize cache getter(loader), setter
   */
  const getMulti = util.promisify(
    config.memcached.getMulti.bind(config.memcached)
  )
  const set = util.promisify(config.memcached.set.bind(config.memcached))

  const cacheLoader = new DataLoader<string, object | null>(
    async (keys) => {
      const itemMap = await getMulti(keys as string[])
      return keys.map((key) => itemMap[key] || null)
    },
    {
      cache: false,
    }
  )

  /**
   * Initialize cache hit ratio logger
   */
  let logger: HitRatioLogger | null

  if (config.logger) {
    logger = new HitRatioLogger()
    let interval = 5 * MINUTE

    if (typeof config.logger === 'object') {
      interval = config.logger.interval
    }

    setInterval(() => {
      logger?.log()
    }, interval)
  }

  type _Types = typeof types
  type _TypeName = keyof _Types
  type _FieldName = keyof _Types[_TypeName]

  async function cachedResolver(
    resolve: any,
    parent: any,
    args: any,
    context: Context,
    info: GraphQLResolveInfo
  ) {
    /**
     * Create cache key
     */
    const typeName = info.parentType.toString() as _TypeName
    const fieldName = info.fieldName as keyof _FieldName

    const field: any = types[typeName]![fieldName]

    const contextKey = config.contextKey(context)
    const fieldKey = field.key(parent, args, context, info)

    let fullCacheKey = [contextKey, typeName + '.' + fieldName, fieldKey].join(
      '$'
    )

    if (fullCacheKey.length > 250) {
      throw new TypeError(
        'TypeError: the cache key size in Memcached should be under 250 characters'
      )
    }

    /**
     * Get cache from cache storage
     */
    config.beforeGet?.(fullCacheKey, null)
    const cachedItem = (await cacheLoader.load(fullCacheKey)) || null
    config.afterGet?.(fullCacheKey, cachedItem)

    /**
     * If cache hit, deserialize item and return it
     */
    if (cachedItem && field.serializer) {
      logger?.hit()
      return field.serializer.deserialize(cachedItem)
    } else if (cachedItem) {
      logger?.hit()
      return cachedItem
    } else {
      logger?.miss()
    }

    /**
     * If cache miss, run `resolve` function and serialize it if serializer exists
     */
    const item = await resolve(parent, args, context)
    let serializedItem: object | undefined

    if (field.serializer) {
      serializedItem = field.serializer.serialize(item)
    }

    /**
     * Save cache to cache storage
     */
    config.beforeSave?.(fullCacheKey, item)
    await set(fullCacheKey, serializedItem || item, field.lifetime)
    config.afterSave?.(fullCacheKey, serializedItem)

    return item
  }

  const cachedResolvers: {
    [TypeName in _TypeName]-?: {
      [FieldName in keyof _Types[_TypeName]]-?: typeof cachedResolver
    }
  } = {} as any

  for (const typename of Object.keys(types) as Array<_TypeName>) {
    if (!cachedResolvers[typename]) {
      cachedResolvers[typename] = {} as any
    }
    for (const fieldName of Object.keys(types[typename]!) as Array<
      keyof _Types[typeof typename]
    >) {
      cachedResolvers[typename][fieldName] = cachedResolver
    }
  }

  return cachedResolvers
}

class HitRatioLogger {
  private startedAt!: number
  private hitCount!: number
  private missCount!: number

  constructor() {
    this.initialize()
  }

  log() {
    const total = this.hitCount + this.missCount

    if (total === 0) {
      log('There was no request from the beginning of the measurement.')
    } else {
      const _duration =
        Math.floor(((Date.now() - this.startedAt) / MINUTE) * 10) / 10
      const _hitRatio = Math.floor((this.hitCount / total) * 1000) / 10
      log(`The cache hit ratio for ${_duration} minutes is ${_hitRatio}%`)
    }

    this.initialize()
  }

  hit() {
    this.hitCount += 1
  }

  miss() {
    this.missCount += 1
  }

  private initialize() {
    this.startedAt = Date.now()
    this.hitCount = 0
    this.missCount = 0
  }
}

function log(message: string) {
  console.log('Cache Log: ' + message)
}
