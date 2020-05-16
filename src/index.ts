import { GraphQLResolveInfo } from "graphql"
import Memcached from 'memcached'

enum CacheType {
  MEMCACHED = 'MEMCACHED',
  REDIS = 'REDIS',
}

type CacheKeyFunction<Context> = <Parent extends {}, Args extends {}>(parent: Parent, args: Args, context: Context) => string

type Connection = {
  memcached: Memcached
}

interface CacheFieldMap<Context> {
  [fieldName: string]: {
    key: CacheKeyFunction<Context>
    lifetime: number
    serializer?: CacheFieldSerializer
  }
}
interface CacheFieldSerializer {
  serialize(m: any): any
  deserialize(serializedModel: any): any
}


export function createCacheMiddleware<Context extends {}>({
  connection,
  fieldMap,
  globalCacheKey,
}: {
  connection: Connection
  fieldMap: CacheFieldMap<Context>
  globalCacheKey?: CacheKeyFunction<Context>
}) {
  const _cacheType: CacheType = CacheType.MEMCACHED

  return async function (resolve: any, parent: any, args: any, context: Context, info: GraphQLResolveInfo) {
    const _fieldName = info.parentType + '.' + info.fieldName

    if (fieldMap[_fieldName]) {
      const _field = fieldMap[_fieldName]

      const _globalCacheKey = globalCacheKey?.(parent, args, context)
      const _fieldCacheKey = _field.key(parent, args, context)

      const fullCacheKey = [
        _globalCacheKey,
        _fieldName,
        _fieldCacheKey,
      ].join('#')

      if (_cacheType === CacheType.MEMCACHED && fullCacheKey.length > 250) {
        throw new TypeError(
          'TypeError: If you use memcached, the cache key size should be under 250 characters'
        )
      }

      let item: object | undefined

      if (_cacheType === CacheType.MEMCACHED) {
        item = await new Promise((resolve, reject) => {
          connection.memcached.get(fullCacheKey, (err, data) => {
            console.log('CACHED!!!!')

            if (err) {
              return reject(err)
            } else {
              return resolve(data)
            }
          })
        })
      }

      if (item) {
        if (_field.serializer) {
          return _field.serializer.deserialize(item)
        } else {
          return item
        }
      }

      const _model = await resolve(parent, args, context)
      let _serializedModel: object | undefined

      if (_field.serializer) {
        _serializedModel = _field.serializer.serialize(_model)
      }

      await new Promise((resolve, reject) => {
        connection.memcached.set(fullCacheKey, _serializedModel || _model, _field.lifetime, (err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      })

      return _model
      
    } else {
      return resolve(parent, args, context)
    }
  }
}
