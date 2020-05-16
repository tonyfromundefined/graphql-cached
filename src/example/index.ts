import { makeSchema } from '@nexus/schema'
import { ApolloServer } from 'apollo-server'
import path from 'path'
import { applyMiddleware } from 'graphql-middleware'
import { createCacheMiddleware } from 'graphql-middleware-cache'
import * as resolvers from './resolvers'
import { createNexusTypegenSources } from './utils'
import __root from './__root'
import { Context } from './context'
import Memcached from 'memcached'

const schema = makeSchema({
  types: {
    resolvers,
  },
  outputs: {
    schema: path.join(__root, './src/example/__generated__/schema.graphql'),
    typegen: path.join(__root, './src/example/__generated__/nexus.d.ts'),
  },
  typegenAutoConfig: {
    contextType: 'Context',
    sources: createNexusTypegenSources(),
  }
})

const memcached = new Memcached('localhost:11212')

const cachedSchema = applyMiddleware(
  schema,
  createCacheMiddleware<Context>({
    connection: {
      memcached,
    },
    globalCacheKey(_parent, _args, context) {
      return 'v1.' + context.user?.role || 'Anonymous'
    },
    fieldMap:{
      'Query.user': {
        lifetime: 10000,
        key(_parent: any, args: any) {
          return JSON.stringify(args)
        },
      },
    },
  }),
)

const server = new ApolloServer({
  schema: cachedSchema,
  context(): Context {
    return {
      user: {
        id: '1',
        role: 'Admin',
      },
    }
  }
})

server.listen().then(({ url }) => {
  console.log(`GraphQL Middleware Cache Example Server ready at ${url}`);
});

