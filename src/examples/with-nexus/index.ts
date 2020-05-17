import { ApolloServer } from 'apollo-server'
import { cached } from '../../index'
import { applyMiddleware } from 'graphql-middleware'
import Memcached from 'memcached'
import path from 'path'

import { makeSchema } from '@nexus/schema'

import { Context } from '../common/context'
import { NexusGenFieldTypes } from './__generated__/nexus'
import __root from './__root'
import * as resolvers from './resolvers'
import {
  createNexusTypegenSources,
  ResolversFromNexusGenFieldTypes
} from './utils'

const memcached = new Memcached('localhost:11211')

memcached.flush(() => {
  console.log('Log: Cache is flushed')
})

const schema = makeSchema({
  types: {
    resolvers,
  },
  outputs: {
    schema: path.join(
      __root,
      './src/examples/with-nexus/__generated__/schema.graphql'
    ),
    typegen: path.join(
      __root,
      './src/examples/with-nexus/__generated__/nexus.d.ts'
    ),
  },
  typegenAutoConfig: {
    contextType: 'Context',
    sources: createNexusTypegenSources(),
  },
})

const cachedSchema = applyMiddleware(
  schema,
  cached<Context, ResolversFromNexusGenFieldTypes<NexusGenFieldTypes>>(
    {
      Query: {
        // @ts-ignore
        user: {
          lifetime: 10,
          // @ts-ignore
          key(_parent, args) {
            return JSON.stringify(args)
          },
        },
      },
      User: {
        // @ts-ignore
        image: {
          lifetime: 1,
          // @ts-ignore
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
