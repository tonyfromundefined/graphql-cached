import { ApolloServer } from 'apollo-server'
import fs from 'fs'
import { cached } from '../../index'
import { applyMiddleware } from 'graphql-middleware'
import { makeExecutableSchema } from 'graphql-tools'
import Memcached from 'memcached'
import path from 'path'

import { Context } from '../common/context'
import { Resolvers } from './__generated__/resolvers'
import __root from './__root'
import resolvers from './resolvers'

const memcached = new Memcached('localhost:11211')

const typeDefs = fs.readFileSync(
  path.join(__root, './src/examples/with-graphql-tools/schema.graphql'),
  'utf-8'
)

memcached.flush(() => {
  console.log('Log: Cache is flushed')
})

const schema = makeExecutableSchema<Context>({
  typeDefs,
  resolvers: resolvers as any,
})

const cachedSchema = applyMiddleware(
  schema,
  cached<Context, Resolvers>(
    {
      Query: {
        user: {
          lifetime: 10,
          key(parent, args) {
            return JSON.stringify(args)
          },
        },
      },
      User: {
        image: {
          lifetime: 1,
          key(parent) {
            return parent.imageId
          },
        },
      },
    },
    {
      memcached,
      contextKey(context) {
        return 'v1.' + context.user?.role || 'Anonymous'
      },
      afterGet(key, data) {
        console.log(key, data)
      },
    }
  )
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
  },
})

server.listen().then(({ url }) => {
  console.log(`GraphQL Middleware Cache Example Server ready at ${url}`)
})
