import type { ResolverLike } from "./resolvers";

export type T<Resolvers> = (
  Resolvers extends { [key: string]: infer _ }
  ? { [P in keyof Resolvers]?: T<Resolvers[P]> }
  : Resolvers extends ResolverLike<infer Type, infer Parent, infer Arg, infer Context>
  ? CacheField<Type, Parent, Arg, Context>
  : never
);

export type CacheField<Type, Parent, Arg, Context> = (
  | CacheFieldKey<Parent, Arg, Context>
  | {
    /**
       * Create a cache key by combining parent, args, context and info.
       * @param {Object} parent
       * @param {Object} args
       * @param {Object} context
       * @param {Object} info
       */
    key: CacheFieldKey<Parent, Arg, Context>;

    /**
       * How much time to keep the cache (seconds)
       */
    lifetime?: number;

    /**
       * Preprocess item before storing in cache and after fetching from cache
       */
    serializer?: CacheFieldSerializer<Type>;
  }
);

export type CacheFieldKey<Parent, Arg, Context> = ResolverLike<string, Parent, Arg, Context>;
export type CacheFieldSerializer<Type> = {
  /**
   * Preprocess item before storing it in the cache
   * @param {Object} item
   * @returns {Object} Serialized item
   */
  serialize(item: Type): any;

  /**
   * Preprocess item after fetching from cache
   * @param {Object} Serialized item
   * @returns {Object} Item
   */
  deserialize(serializedItem: any): Type;
};
