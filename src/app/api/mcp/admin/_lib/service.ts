import { getAdminSecretForConvex } from "./auth";
import { convexMutation, convexQuery } from "./convex";

type Args = Record<string, unknown>;

export async function mcpAdminQuery<T>(name: string, args: Args = {}): Promise<T> {
  return convexQuery<T>(`mcpAdmin.${name}`, {
    secret: getAdminSecretForConvex(),
    ...args,
  });
}

export async function mcpAdminMutation<T>(name: string, args: Args = {}): Promise<T> {
  return convexMutation<T>(`mcpAdmin.${name}`, {
    secret: getAdminSecretForConvex(),
    ...args,
  });
}
