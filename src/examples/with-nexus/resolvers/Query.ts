import { arg, inputObjectType, queryType } from '@nexus/schema'

import { IMAGES, USERS } from '../models'

export const Query = queryType({
  definition(t) {
    t.field('user', {
      type: 'User',
      nullable: true,
      args: {
        where: arg({
          type: 'UserWhereInput',
          required: true,
        }),
      },
      resolve(_parent, args) {
        return USERS.find((user) => user.id === args.where.id) || null
      },
    })

    t.list.field('users', {
      type: 'User',
      resolve() {
        return USERS
      },
    })

    t.list.field('images', {
      type: 'Image',
      resolve() {
        return IMAGES
      },
    })
  },
})

export const UserWhereInput = inputObjectType({
  name: 'UserWhereInput',
  definition(t) {
    t.string('id', {
      required: true,
    })
  },
})
