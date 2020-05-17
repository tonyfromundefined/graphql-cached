import fs from 'fs'
import { GraphQLNamedType } from 'graphql'
import path from 'path'

import {
  FieldResolver,
  TypegenConfigSourceModule
} from '@nexus/schema/dist/core'

import { NexusGenFieldTypes } from '../__generated__/nexus'
import __root from '../__root'

export function createNexusTypegenSources() {
  const sources: TypegenConfigSourceModule[] = []

  try {
    const models = fs
      .readdirSync(path.resolve(__root, './src/examples/with-nexus/models'))
      .filter((model) => model !== 'index.ts')

    for (const model of models) {
      sources.push({
        alias: path.parse(model).name,
        source: path.resolve(
          __root,
          `./src/examples/with-nexus/models/${model}`
        ),
        typeMatch: (type: GraphQLNamedType) =>
          new RegExp(`(?:class|type|interface)\\s+(Model${type.name})\\W`),
      })
    }

    return sources
  } catch (error) {
    return []
  }
}

export type ResolversFromNexusGenFieldTypes<N extends NexusGenFieldTypes> = {
  [TypeName in keyof N]?: {
    [FieldName in keyof N[TypeName]]?: TypeName extends string
      ? FieldName extends string
        ? FieldResolver<TypeName, FieldName>
        : undefined
      : undefined
  }
}
