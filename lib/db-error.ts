import { supabase } from "@/lib/supabase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export type TDbErrorInfo = {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
  };
};

export async function handleDbError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): Promise<never> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;

  const errInfo: TDbErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.id,
      email: user?.email,
    },
    operationType,
    path,
  };
  console.error("DB Error: ", errInfo);
  throw new Error(JSON.stringify(errInfo));
}
