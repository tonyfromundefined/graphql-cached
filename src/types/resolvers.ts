export interface ResolversBase {
  [typeName: string]:
    | {
        [fieldName: string]:
          | ((parent: any, args: any, context: any, info: any) => any)
          | undefined
      }
    | undefined
}
