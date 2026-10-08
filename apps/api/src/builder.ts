import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import { GraphQLError, Kind } from 'graphql';

import type { Context } from './context.js';
import { getPrisma } from './db.js';
import { unauthenticated } from './errors.js';
import type PrismaTypes from './generated/pothos-types.js';
import { getDatamodel } from './generated/pothos-types.js';

export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  AuthScopes: { loggedIn: boolean };
  DefaultFieldNullability: false;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    SafeInt: { Input: number; Output: number };
  };
}>({
  plugins: [ScopeAuthPlugin, PrismaPlugin, RelayPlugin],
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: (ctx) => ({ loggedIn: ctx.userId !== null }),
    unauthorizedError: () => unauthenticated(),
  },
  prisma: {
    client: () => getPrisma(),
    dmmf: getDatamodel(),
    exposeDescriptions: true,
    filterConnectionTotalCount: true,
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
  relay: {
    cursorType: 'String',
    nodeQueryOptions: false,
    nodesQueryOptions: false,
    clientMutationId: 'omit',
  },
});

builder.scalarType('DateTime', {
  description: 'ISO-8601 timestamp',
  serialize: (value) => value.toISOString(),
  parseValue: (value) => {
    if (typeof value !== 'string' && !(value instanceof Date)) throw new GraphQLError('DateTime must be a string');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError('Invalid DateTime');
    return date;
  },
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string');
    const date = new Date(ast.value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError('Invalid DateTime');
    return date;
  },
});

/**
 * Money is always an integer number of minor units (paise, cents…). GraphQL's
 * Int is 32-bit, which per-expense amounts fit in, but aggregates (group
 * totals, balances across many expenses) may not — so money uses a scalar
 * that accepts any JS safe integer and rejects fractions.
 */
builder.scalarType('SafeInt', {
  description: 'An integer between -(2^53-1) and 2^53-1. Used for money in minor units (e.g. paise).',
  serialize: (value) => {
    if (!Number.isSafeInteger(value)) throw new GraphQLError('SafeInt cannot represent a non-integer');
    return value;
  },
  parseValue: (value) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new GraphQLError('SafeInt must be a safe integer');
    }
    return value;
  },
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.INT) throw new GraphQLError('SafeInt must be an integer literal');
    const value = Number(ast.value);
    if (!Number.isSafeInteger(value)) throw new GraphQLError('SafeInt out of range');
    return value;
  },
});

builder.queryType({});
builder.mutationType({});
builder.subscriptionType({});
