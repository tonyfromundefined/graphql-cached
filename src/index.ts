import DataLoader from "dataloader";
import { GraphQLResolveInfo } from "graphql";
import Memcached from "memcached";
import util from "util";

const MINUTE = 1000 * 60;

interface CreateCacheMiddlewareParams {
  /**
   * Memcached instance to use as cache storage
   */
  memcached: Memcached;

  /**
   * Declare which fields to cache and how to cache.
   */
  fieldMap: CacheFieldMap<Context>;

  /**
   * Set the namespace to attach to the front of the cache key based on context
   */
  contextKey: ContextKeyFunction<Context>;

  /**
   * Triggered before cache fetching
   * @param {string} key Cache key
   */
  beforeGet?: LifeCycleHook;

  /**
   * Triggered after cache fetching
   * @param {string} key Cache key
   * @param {Object} [data] Cached item
   */
  afterGet?: LifeCycleHook;

  /**
   * Triggered before cache storing
   * @param {string} key Cache key
   * @param {Object} [data] item
   */
  beforeSave?: LifeCycleHook;

  /**
   * Triggered after cache storing
   * @param {string} key Cache key
   * @param {Object} [data] Serialized item
   */
  afterSave?: LifeCycleHook;

  /**
   * Log hit ratio by 5 minutes
   */
  logger?:
    | true
    | {
        interval: number;
      };
}

interface CacheFieldMap<Context> {
  [fieldName: string]: {
    /**
     * Create a cache key by combining parent, args, and context.
     * @param {Object} parent
     * @param {Object} args
     * @param {Object} context
     */
    key: CacheFieldMapKeyFunction<Context>;

    /**
     * How much time to keep the cache (seconds)
     */
    lifetime: number;

    /**
     * Preprocess item before storing in cache and after fetching from cache
     */
    serializer?: CacheFieldSerializer;
  };
}

type CacheFieldMapKeyFunction<Context> = (
  parent: any,
  args: any,
  context: Context
) => string;

interface CacheFieldSerializer {
  /**
   * Preprocess item before storing it in the cache
   * @param {Object} item
   * @returns {Object} Serialized item
   */
  serialize(item: any): any;

  /**
   * Preprocess item after fetching from cache
   * @param {Object} Serialized item
   * @returns {Object} Item
   */
  deserialize(serializedItem: any): any;
}

type ContextKeyFunction<Context> = (context: Context) => string;

type LifeCycleHook = (key: string, data: any | null) => void;

export function createCacheMiddleware<Context = {}>(
  params: CreateCacheMiddlewareParams
) {
  /**
   * Initialize cache getter(loader), setter
   */
  const getMulti = util.promisify(
    params.memcached.getMulti.bind(params.memcached)
  );
  const set = util.promisify(params.memcached.set.bind(params.memcached));

  const cacheLoader = new DataLoader<string, object | null>(
    async (keys) => {
      const itemMap = await getMulti(keys as string[]);
      return keys.map((key) => itemMap[key] || null);
    },
    {
      cache: false,
    }
  );

  /**
   * Initialize cache hit ratio logger
   */
  let logger: CacheHitRatioLogger | null;

  if (params.logger) {
    logger = new CacheHitRatioLogger();
    let interval = 5 * MINUTE;

    if (typeof params.logger === "object") {
      interval = params.logger.interval;
    }

    setInterval(() => {
      logger?.finish();
      logger?.start();
    }, interval);
  }

  /**
   * the Middleware
   */
  return async function cachedResolver(
    resolve: any,
    parent: any,
    args: any,
    context: Context,
    info: GraphQLResolveInfo
  ) {
    /**
     * Create cache key
     */
    const fieldName = info.parentType + "." + info.fieldName;

    if (params.fieldMap[fieldName]) {
      const field = params.fieldMap[fieldName];

      const contextKey = params.contextKey(context);
      const fieldKey = field.key(parent, args, context);

      let fullCacheKey = [contextKey, fieldName, fieldKey].join("$");

      if (fullCacheKey.length > 250) {
        throw new TypeError(
          "TypeError: the cache key size in Memcached should be under 250 characters"
        );
      }

      /**
       * Get cache from cache storage
       */
      params.beforeGet?.(fullCacheKey, null);
      const cachedItem = (await cacheLoader.load(fullCacheKey)) || null;
      params.afterGet?.(fullCacheKey, cachedItem);

      /**
       * If cache hit, deserialize item and return it
       */
      if (cachedItem) {
        logger?.hit();
        return field.serializer
          ? field.serializer.deserialize(cachedItem)
          : cachedItem;
      } else {
        logger?.miss();
      }

      /**
       * If cache miss, run `resolve` function and serialize it if serializer exists
       */
      const item = await resolve(parent, args, context);
      let serializedItem: object | undefined;

      if (field.serializer) {
        serializedItem = field.serializer.serialize(item);
      }

      /**
       * Save cache to cache storage
       */
      params.beforeSave?.(fullCacheKey, item);
      await set(fullCacheKey, serializedItem || item, field.lifetime);
      params.afterSave?.(fullCacheKey, serializedItem);

      return item;
    } else {
      return resolve(parent, args, context);
    }
  };
}

class CacheHitRatioLogger {
  private _startTime = Date.now();
  private _total = 0;
  private _hit = 0;
  private _miss = 0;

  start() {
    this._startTime = Date.now();
    this._total = 0;
    this._hit = 0;
    this._miss = 0;
  }

  hit() {
    this._total += 1;
    this._hit += 1;
  }

  miss() {
    this._total += 1;
    this._miss += 1;
  }

  finish() {
    if (this._total === 0) {
      log("There was no request from the beginning of the measurement.");
    } else {
      const _duration =
        Math.floor(((Date.now() - this._startTime) / MINUTE) * 10) / 10;
      const _hitRatio = Math.floor((this._hit / this._total) * 1000) / 10;
      log(`The cache hit ratio for ${_duration} minutes is ${_hitRatio}%`);
    }
  }
}

function log(message: string) {
  console.log("Cache Log: " + message);
}
