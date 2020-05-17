import { GraphQLResolveInfo } from 'graphql'

export type T<RequiredResolvers> = {
  [TypeName in keyof RequiredResolvers]?: {
    [FieldName in keyof RequiredResolvers[TypeName]]?: CacheField<
      Parameters<RequiredResolvers[TypeName][FieldName]>[0],
      Parameters<RequiredResolvers[TypeName][FieldName]>[1],
      Parameters<RequiredResolvers[TypeName][FieldName]>[2]
    >
  }
}

export type CacheField<Parent, Arg, Context> =
  | CacheFieldKey<Parent, Arg, Context>
  | {
      /**
       * Create a cache key by combining parent, args, context and info.
       * @param {Object} parent
       * @param {Object} args
       * @param {Object} context
       * @param {Object} info
       */
      key: CacheFieldKey<Parent, Arg, Context>

      /**
       * How much time to keep the cache (seconds)
       */
      lifetime?: number

      /**
       * Preprocess item before storing in cache and after fetching from cache
       */
      serializer?: CacheFieldSerializer
    }

export type CacheFieldKey<Parent, Arg, Context> = (
  parent: Parent,
  args: Arg,
  context: Context,
  info: GraphQLResolveInfo
) => string

export type CacheFieldSerializer = {
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
