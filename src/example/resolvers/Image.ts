import { objectType } from '@nexus/schema'

export const Image = objectType({
  name: 'Image',
  definition(t) {
    t.id('id', {
      resolve(parent) {
        return 'Image#' + parent.id
      }
    })
    t.string('url')
  }
})
