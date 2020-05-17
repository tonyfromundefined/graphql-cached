import DataLoader from 'dataloader'
import { GraphQLResolveInfo } from 'graphql'
import { promisify } from 'util'

import { CacheField, Config, ResolversBase, T } from './types'

const DEFAULT_LIFETIME = 10

export function cached<Context, Resolvers = ResolversBase>(
  t: T<Required<Resolvers>>,
  config: Config<Context>
) {
  const _t: any = t

  /**
   * Initialize cache getter(loader), setter
   */
  const getMulti = promisify(config.memcached.getMulti).bind(config.memcached)
  const set = promisify(config.memcached.set).bind(config.memcached)

  const cacheLoader = new DataLoader<string, object | null>(
    async (keys) => {
      const itemMap = await getMulti(keys as string[])
      return keys.map((key) => itemMap[key] || null)
    },
    {
      cache: false,
    }
  )

  const resolveWithCache = async (
    resolve: any,
    parent: any,
    args: any,
    context: Context,
    info: GraphQLResolveInfo
  ) => {
    const _typeName = info.parentType.toString()
    const _fieldName = info.fieldName

    const _field: CacheField<any, any, any> = _t[_typeName][_fieldName]
    const _fieldKey = 'key' in _field ? _field.key : _field
    const _fieldSerializer = 'serializer' in _field ? _field.serializer : null
    const _fieldLifetime = 'lifetime' in _field ? _field.lifetime : null

    /**
     * Create cache key
     * {contextKey}${typeName}${fieldName}${fieldKey}
     */
    const contextKey = config.contextKey(context)
    const typeName = _typeName
    const fieldName = _fieldName
    const fieldKey = _fieldKey(parent, args, context, info)

    let key = [contextKey, typeName, fieldName, fieldKey].join('$')

    if (key.length > 250) {
      throw new TypeError(
        'TypeError: the cache key size in Memcached should be under 250 characters'
      )
    }

    /**
     * Get cache from cache storage
     */
    config.beforeGet?.(key, null)
    const cachedItem = (await cacheLoader.load(key)) || null
    config.afterGet?.(key, cachedItem)

    if (cachedItem) {
      /**
       * If cache hit, deserialize item and return it
       */
      config.onHit?.(key, cachedItem)

      let item = cachedItem

      if (_fieldSerializer) {
        item = _fieldSerializer.deserialize(cachedItem)
      }

      return item
    } else {
      /**
       * If cache miss, run `resolve` function and serialize it if serializer exists
       */
      config.onMiss?.(key, null)

      const item = await resolve(parent, args, context, info)
      let serializedItem: object | undefined

      if (_fieldSerializer) {
        serializedItem = _fieldSerializer.serialize(item)
      }

      /**
       * Save cache to cache storage
       */
      config.beforeSave?.(key, item)
      await set(key, serializedItem || item, _fieldLifetime || DEFAULT_LIFETIME)
      config.afterSave?.(key, serializedItem)

      return item
    }
  }

  const resolvers: any = {}

  for (const typeName of Object.keys(_t)) {
    resolvers[typeName] = {}

    for (const fieldName of Object.keys(_t[typeName])) {
      resolvers[typeName][fieldName] = resolveWithCache
    }
  }

  return resolvers
}
