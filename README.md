# ⚡️ GraphQL Cached

Write a cache layer for each resolver in [GraphQL Shield](https://github.com/maticzav/graphql-shield) style with Memcached

## Dependencies

- [Memcached](https://github.com/3rd-Eden/memcached)
- [GraphQL Middleware](https://github.com/prisma-labs/graphql-middleware)
- Your GraphQL Schema

## Install

```bash
$ yarn add graphql-cached
```

## Usage

### with `graphql-tools`

```typescript
import { cached } from 'graphql-cached'
import { applyMiddleware } from 'graphql-middleware'
import Memcached from 'memcached'
import schema from './schema'

const memcached = new Memcached('my.memcached.host:11211')

// Generated resolver types by `@graphql-codegen/cli`
import { Resolvers } from './__generated__/resolvers'
import { Context } from './context'

const middleware = cached<Context, Resolvers>(
  {
    User: {
      image: {
        key(parent, args, context) {
          // it's type-safe!
          return parent.imageId
        },
        lifetime: 5,
        serializer: {
          serialize(item) {
            return item
          },
          deserialize(serializedItem) {
            return new Image(serializedItem)
          },
        },
      },
    },
  },
  {
    memcached,
    contextKey(context) {
      return 'v1.' + context.user?.role || 'Anonymous'
    },
  }
)

// Now schema is automatically cached!
const cachedSchema = applyMiddleware(schema, middleware)
```

## Cache Field

- TypeScript Definitions:

### Required

- `key`: `fieldKey` generation function

### Optional

- `lifetime`: How much time to keep the cache (seconds) (default: 10 seconds)
- `serializer`: Preprocess item before storing in cache and after fetching from cache

## Configuration

### Required

- `memcached`: Memcached client instance
- `contextKey`: Key generation function based on `Context`

### Life cycle hooks (Optional)

- `beforeGet`: Triggered before cache fetching
- `afterGet`: Triggered after cache fetching
- `beforeSave`: Triggered before cache storing
- `afterSave`: Triggered before cache storing
- `onHit`: Triggered when cache hit
- `onMiss`: Triggered when cache miss

## Full cache key

```
{contextKey}${typeName}${fieldName}${fieldKey}
```

### Examples

```
v1.Admin$User$image$dbf66e27-9bb4-5682-b890-ecf34fe63333

v1.User$Query$user${"where":{"id":"57c5fb3f-a5e7-5b4f-a7ed-ab50281b8222"}}
```

> ### ⚠️ Be careful!
>
> If there are resolvers with different responses for different users, carefully write the key generation function. Items cached for one user may be visible to other users.
>
> Also, if there is a cached item, the existing resolver does not work. If you want to do permission-related logic before cache layer, I recommend using it with [graphql-shield](https://github.com/maticzav/graphql-shield).
>
> ```typescript
> const schemaWithMiddleware = applyMiddleware(
>   schema,
>   authMiddleware, // created with graphql-shield
>   cachedMiddleware // created with graphql-cached
> )
> ```
>
> For more information on how GraphQL Middleware works, check out [GraphQL Middleware](https://github.com/prisma-labs/graphql-middleware).

## Usage examples

- [with-graphql-tools](./src/examples/with-graphql-tools)
- [with-nexus](./src/examples/with-nexus)

> If you have a feature request or a bug, please create a new issue. And also, pull requests are always welcome🙏
