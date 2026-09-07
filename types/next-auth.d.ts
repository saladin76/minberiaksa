import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "ADMIN" | "DONOR" | "STAFF";
      /** Present for STAFF; ignored for ADMIN in UI */
      dashboardPermissions?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ADMIN" | "DONOR" | "STAFF";
    dashboardPermissions?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "ADMIN" | "DONOR" | "STAFF";
    dashboardPermissions?: string[];
  }
}
