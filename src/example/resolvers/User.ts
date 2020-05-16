import { objectType } from '@nexus/schema'

import { IMAGES } from '../models'

export const User = objectType({
  name: 'User',
  definition(t) {
    t.id('id', {
      resolve(parent) {
        return 'User#' + parent.id
      },
    })
    t.field('image', {
      type: 'Image',
      nullable: true,
      resolve(parent) {
        return IMAGES.find((image) => image.id === parent.imageId) || null
      },
    })
  },
})
