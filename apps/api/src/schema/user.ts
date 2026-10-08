import { builder } from '../builder.js';

export const UserRef = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    avatarColor: t.exposeString('avatarColor'),
    isDemo: t.exposeBoolean('isDemo'),
    email: t.string({
      nullable: true,
      description: "Only visible to the user themself; null for everyone else's profile.",
      resolve: (user, _args, ctx) => (user.id === ctx.userId ? user.email : null),
    }),
  }),
});

builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    description: 'The signed-in user, or null when not authenticated.',
    resolve: (query, _root, _args, ctx) =>
      ctx.userId ? ctx.prisma.user.findUnique({ ...query, where: { id: ctx.userId } }) : null,
  }),
);
