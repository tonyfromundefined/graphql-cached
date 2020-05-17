interface ContextType {
  user?: {
    id: string
    role: 'Admin' | 'Staff' | 'User'
  }
}

declare global {
  export type Context = ContextType
}

export { ContextType as Context }
