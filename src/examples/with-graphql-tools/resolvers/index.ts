import { IMAGES, USERS } from '../../common/models'
import { Resolvers } from '../__generated__/resolvers'

const resolvers: Resolvers = {
  Query: {
    user(parent, args) {
      return USERS.find((user) => user.id === args.where.id) || null
    },
    users() {
      return USERS
    },
    images() {
      return IMAGES
    },
  },
  Image: {
    id(parent) {
      return 'Image#' + parent.id
    },
  },
  User: {
    id(parent) {
      return 'User#' + parent.id
    },
    image(parent) {
      return IMAGES.find((image) => image.id === parent.imageId) || null
    },
  },
}

export default resolvers
