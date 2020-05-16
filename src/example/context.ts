interface _Context {
  user?: {
    id: string
    role: 'Admin' | 'Staff' | 'User'
  }
}

declare global {
  export type Context = _Context
}

export {
  _Context as Context,
}
