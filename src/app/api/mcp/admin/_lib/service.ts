import { getAdminSecretForConvex } from "./auth";
import { convexMutation, convexQuery } from "./convex";

type Args = Record<string, unknown>;

function toConvexFunctionPath(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Convex function name is required");
  }

  // Convex expects module:function (e.g. mcpAdmin:listCourses).
  // Accept dotted input defensively and normalize it to avoid runtime path errors.
  if (normalized.includes(":")) {
    return normalized;
  }
  if (normalized.includes(".")) {
    const [module, fn] = normalized.split(".", 2);
    if (module && fn) {
      return `${module}:${fn}`;
    }
  }
  return `mcpAdmin:${normalized}`;
}

export async function mcpAdminQuery<T>(name: string, args: Args = {}): Promise<T> {
  return convexQuery<T>(toConvexFunctionPath(name), {
    secret: getAdminSecretForConvex(),
    ...args,
  });
}

export async function mcpAdminMutation<T>(name: string, args: Args = {}): Promise<T> {
  return convexMutation<T>(toConvexFunctionPath(name), {
    secret: getAdminSecretForConvex(),
    ...args,
  });
}
