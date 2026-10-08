import type { CombinedError } from 'urql';

export interface ErrorInfo {
  message: string;
  fields: Record<string, string>;
  code?: string;
}

/** Turn an urql CombinedError into a user-facing message plus per-field errors. */
export function errorInfo(error: CombinedError | null | undefined): ErrorInfo | null {
  if (!error) return null;
  if (error.networkError) {
    return { message: "Can't reach the server. Check your connection and try again.", fields: {} };
  }
  const first = error.graphQLErrors[0];
  return {
    message: first?.message ?? 'Something went wrong',
    fields: (first?.extensions?.fields as Record<string, string> | undefined) ?? {},
    code: first?.extensions?.code as string | undefined,
  };
}
