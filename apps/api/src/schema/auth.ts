import { loginSchema, signUpSchema } from '@splitease/shared';

import { getDummyHash, hashPassword, verifyPassword } from '../auth/password.js';
import { issueSession, rotateRefreshToken, revokeRefreshToken, type IssuedSession } from '../auth/tokens.js';
import { builder } from '../builder.js';
import { appError, parseInput } from '../errors.js';
import { createDemoSandbox } from '../services/demo.js';
import { pickAvatarColor } from '../services/groups.js';

const AuthPayload = builder.objectRef<IssuedSession>('AuthPayload').implement({
  description:
    'Access token (JWT, 15 min) for the Authorization header, plus an opaque refresh token (30 days) that is rotated on every use.',
  fields: (t) => ({
    accessToken: t.exposeString('accessToken'),
    accessTokenExpiresAt: t.expose('accessTokenExpiresAt', { type: 'DateTime' }),
    refreshToken: t.exposeString('refreshToken'),
    refreshTokenExpiresAt: t.expose('refreshTokenExpiresAt', { type: 'DateTime' }),
    user: t.prismaField({
      type: 'User',
      resolve: (query, session, _args, ctx) =>
        ctx.prisma.user.findUniqueOrThrow({ ...query, where: { id: session.userId } }),
    }),
  }),
});

const SignUpInput = builder.inputType('SignUpInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    email: t.string({ required: true }),
    password: t.string({ required: true }),
  }),
});

const LoginInput = builder.inputType('LoginInput', {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
  }),
});

const invalidCredentials = () =>
  appError('BAD_USER_INPUT', 'Incorrect email or password', { fields: { password: 'Incorrect email or password' } });

builder.mutationFields((t) => ({
  signUp: t.field({
    type: AuthPayload,
    args: { input: t.arg({ type: SignUpInput, required: true }) },
    resolve: async (_root, args, ctx) => {
      const input = parseInput(signUpSchema, args.input);
      const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw appError('CONFLICT', 'An account with this email already exists', {
          fields: { email: 'An account with this email already exists' },
        });
      }
      const user = await ctx.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          avatarColor: pickAvatarColor(input.email),
        },
      });
      return issueSession(ctx.prisma, user.id);
    },
  }),

  login: t.field({
    type: AuthPayload,
    args: { input: t.arg({ type: LoginInput, required: true }) },
    resolve: async (_root, args, ctx) => {
      const input = parseInput(loginSchema, args.input);
      const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (!user?.passwordHash) {
        // Burn the same CPU time as a real check so response timing does not reveal which emails exist.
        await verifyPassword(await getDummyHash(), input.password);
        throw invalidCredentials();
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) throw invalidCredentials();
      return issueSession(ctx.prisma, user.id);
    },
  }),

  loginDemo: t.field({
    type: AuthPayload,
    description:
      'One-tap demo: creates a private, throw-away sandbox (you + 6 friends, 4 groups, realistic expenses) and signs you in. Sandboxes are deleted after 24 hours.',
    resolve: async (_root, _args, ctx) => {
      const userId = await createDemoSandbox(ctx.prisma);
      return issueSession(ctx.prisma, userId);
    },
  }),

  refreshSession: t.field({
    type: AuthPayload,
    description: 'Exchange a refresh token for a new access + refresh token pair. The old refresh token stops working.',
    args: { refreshToken: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const result = await rotateRefreshToken(ctx.prisma, args.refreshToken);
      if (!result.ok) {
        throw appError('UNAUTHENTICATED', 'Your session has expired, please sign in again', { reason: result.reason });
      }
      return result.session;
    },
  }),

  logout: t.boolean({
    description: 'Revoke the refresh token (and every token rotated from the same login).',
    args: { refreshToken: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await revokeRefreshToken(ctx.prisma, args.refreshToken);
      return true;
    },
  }),
}));
