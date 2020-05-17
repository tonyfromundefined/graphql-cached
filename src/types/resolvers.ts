import type { GraphQLResolveInfo } from "graphql";

export type ResolverLike<Type, Parent, Arg, Context = any> = (
  root: Parent,
  args: Arg,
  context: Context,
  info: GraphQLResolveInfo
) => Type | Promise<Type>;
