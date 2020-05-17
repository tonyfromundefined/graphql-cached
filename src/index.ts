import DataLoader from 'dataloader'
import { GraphQLResolveInfo } from 'graphql'
import { promisify } from 'util'

import type { Config, T, ResolverLike, CacheField } from './types'
import type { IMiddlewareTypeMap } from 'graphql-middleware'

const DEFAULT_LIFETIME = 10

export function cached<Context, Resolvers>(
  t: T<Resolvers>,
  config: Config<Context>
): IMiddlewareTypeMap<any, Context> {
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

  const resolveWithCache = async<Type, Parent, Arg>(
    resolve: ResolverLike<Type, Parent, Arg, Context>,
    parent: Parent,
    args: Arg,
    context: Context,
    info: GraphQLResolveInfo
  ): Promise<Type> => {
    const _typeName = info.parentType.toString() as keyof typeof t;
    const _type = t[_typeName];

    const _fieldName = info.fieldName as keyof typeof _type;
    const _field = _type[_fieldName] as CacheField<Type, Parent, Arg, Context>;

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
    const cachedItem = (await cacheLoader.load(key) as unknown as Type) || null
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

  const resolvers: any = {};

  for (const typeName of Object.keys(t)) {
    resolvers[typeName] = {};

    const _type = t[typeName as keyof typeof t];
    if (!_type) {
      continue;
    }
    for (const fieldName of Object.keys(_type as NonNullable<typeof _type>)) {
      resolvers[typeName][fieldName] = resolveWithCache
    }
  }

  return resolvers
}
