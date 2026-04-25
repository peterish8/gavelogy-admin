"use client";

import { createContext, useContext } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";

type AuthResult = { success: boolean; error?: string };

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any | undefined;
  isAdmin: boolean | undefined;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions();
  const user = useQuery((api as any).users.getMe, isAuthenticated ? {} : "skip");
  const isAdmin = useQuery((api as any).admin.isAdmin, isAuthenticated ? {} : "skip");

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    try {
      await convexSignIn("password", { email, password, flow: "signIn" });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("InvalidCredentials") || msg.includes("invalid credential")) {
        return { success: false, error: "Invalid email or password. Please try again." };
      }

      if (msg.includes("InvalidAccountId") || msg.includes("not found") || msg.includes("Account not found")) {
        return { success: false, error: "Account not found. Ask an existing admin to create access first." };
      }

      return { success: false, error: msg || "Login failed. Please try again." };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName?: string
  ): Promise<AuthResult> => {
    try {
      await convexSignIn("password", {
        email,
        password,
        flow: "signUp",
        ...(fullName ? { name: fullName } : {}),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Sign up failed",
      };
    }
  };

  const signOut = async () => {
    await convexSignOut();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        isAdmin,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
