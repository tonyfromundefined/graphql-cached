import { TypegenConfigSourceModule } from "@nexus/schema/dist/core"
import fs from 'fs'
import { GraphQLNamedType } from "graphql"
import path from 'path'
import __root from '../__root'

export function createNexusTypegenSources() {
  const sources: TypegenConfigSourceModule[] = []

  try {
    const models = fs
      .readdirSync(path.resolve(__root, './src/example/models'))
      .filter((model) => model !== 'index.ts')

    for (const model of models) {
      sources.push({
        alias: path.parse(model).name,
        source: path.resolve(__root, `./src/example/models/${model}`),
        typeMatch: (type: GraphQLNamedType) =>
          new RegExp(`(?:class|type|interface)\\s+(Model${type.name})\\W`),
      })
    }

    return sources
  } catch (error) {
    return []
  }
}
