import { graphql } from './generated';

/* ---------------------------------------------------------------- fragments */

export const UserFields = graphql(`
  fragment UserFields on User {
    id
    name
    avatarColor
  }
`);

export const GroupCardFields = graphql(`
  fragment GroupCardFields on Group {
    id
    name
    emoji
    currency
    memberCount
    myBalance
    totalSpent
    updatedAt
    members {
      id
      user {
        ...UserFields
      }
    }
  }
`);

export const ExpenseRowFields = graphql(`
  fragment ExpenseRowFields on Expense {
    id
    description
    amount
    currency
    category
    splitMode
    date
    myShare
    paidBy {
      ...UserFields
    }
  }
`);

export const ActivityFields = graphql(`
  fragment ActivityFields on Activity {
    id
    type
    summary
    amount
    currency
    createdAt
    expenseId
    actor {
      ...UserFields
    }
    group {
      id
      name
      emoji
    }
  }
`);

/* ------------------------------------------------------------------ queries */

export const MeQuery = graphql(`
  query Me {
    me {
      id
      name
      email
      avatarColor
      isDemo
    }
  }
`);

export const DashboardQuery = graphql(`
  query Dashboard {
    dashboard {
      totals {
        currency
        owed
        owes
        net
      }
      friends {
        currency
        amount
        user {
          ...UserFields
        }
      }
    }
    groups {
      ...GroupCardFields
    }
  }
`);

export const GroupQuery = graphql(`
  query Group($id: ID!) {
    group(id: $id) {
      id
      name
      emoji
      currency
      inviteCode
      inviteUrl
      viewerRole
      memberCount
      totalSpent
      expenseCount
      myBalance
      members {
        id
        role
        user {
          ...UserFields
        }
      }
      balances {
        net
        user {
          ...UserFields
        }
      }
      simplifiedDebts {
        amount
        from {
          ...UserFields
        }
        to {
          ...UserFields
        }
      }
      categoryBreakdown {
        category
        amount
        count
      }
    }
  }
`);

export const GroupExpensesQuery = graphql(`
  query GroupExpenses($id: ID!, $first: Int, $after: String, $search: String, $category: ExpenseCategory) {
    group(id: $id) {
      id
      expenses(first: $first, after: $after, search: $search, category: $category) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ...ExpenseRowFields
          }
        }
      }
    }
  }
`);

export const ExpenseQuery = graphql(`
  query Expense($id: ID!) {
    expense(id: $id) {
      ...ExpenseRowFields
      notes
      createdAt
      updatedAt
      createdBy {
        ...UserFields
      }
      group {
        id
        name
        emoji
        currency
      }
      shares {
        id
        amount
        value
        user {
          ...UserFields
        }
      }
    }
  }
`);

export const ActivityQuery = graphql(`
  query Activity($first: Int, $after: String) {
    activity(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ActivityFields
        }
      }
    }
  }
`);

export const InvitePreviewQuery = graphql(`
  query InvitePreview($code: String!) {
    invitePreview(code: $code) {
      code
      groupId
      name
      emoji
      currency
      memberCount
      alreadyMember
    }
  }
`);

/* ---------------------------------------------------------------- mutations */

export const LoginMutation = graphql(`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      accessTokenExpiresAt
      refreshToken
      user {
        id
        name
      }
    }
  }
`);

export const SignUpMutation = graphql(`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      accessToken
      accessTokenExpiresAt
      refreshToken
      user {
        id
        name
      }
    }
  }
`);

export const LoginDemoMutation = graphql(`
  mutation LoginDemo {
    loginDemo {
      accessToken
      accessTokenExpiresAt
      refreshToken
      user {
        id
        name
      }
    }
  }
`);

export const CreateGroupMutation = graphql(`
  mutation CreateGroup($input: GroupInput!) {
    createGroup(input: $input) {
      ...GroupCardFields
      inviteCode
      inviteUrl
    }
  }
`);

export const UpdateGroupMutation = graphql(`
  mutation UpdateGroup($id: ID!, $input: GroupInput!) {
    updateGroup(id: $id, input: $input) {
      id
      name
      emoji
      currency
    }
  }
`);

export const JoinGroupMutation = graphql(`
  mutation JoinGroup($code: String!) {
    joinGroup(code: $code) {
      ...GroupCardFields
    }
  }
`);

export const RegenerateInviteMutation = graphql(`
  mutation RegenerateInvite($groupId: ID!) {
    regenerateInviteCode(groupId: $groupId) {
      id
      inviteCode
      inviteUrl
    }
  }
`);

export const CreateExpenseMutation = graphql(`
  mutation CreateExpense($groupId: ID!, $input: ExpenseInput!) {
    createExpense(groupId: $groupId, input: $input) {
      ...ExpenseRowFields
      group {
        id
      }
    }
  }
`);

export const UpdateExpenseMutation = graphql(`
  mutation UpdateExpense($id: ID!, $input: ExpenseInput!) {
    updateExpense(id: $id, input: $input) {
      ...ExpenseRowFields
      notes
      group {
        id
      }
      shares {
        id
        amount
        value
        user {
          ...UserFields
        }
      }
    }
  }
`);

export const DeleteExpenseMutation = graphql(`
  mutation DeleteExpense($id: ID!) {
    deleteExpense(id: $id)
  }
`);

export const SettleUpMutation = graphql(`
  mutation SettleUp($groupId: ID!, $input: SettlementInput!) {
    settleUp(groupId: $groupId, input: $input) {
      id
      amount
      currency
      group {
        id
      }
    }
  }
`);

/* ------------------------------------------------------------ subscriptions */

export const ActivityAddedSubscription = graphql(`
  subscription ActivityAdded($groupId: ID) {
    activityAdded(groupId: $groupId) {
      ...ActivityFields
    }
  }
`);
