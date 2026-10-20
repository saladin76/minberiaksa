"use client";
import axios from "axios";
import { useEffect } from "react";
export function SettingsWriteGuard({
  endpoint,
  version,
  children,
}: {
  endpoint: string;
  version: string | null;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const interceptor = axios.interceptors.request.use((config) => {
      if (
        (config.method === "put" || config.method === "patch") &&
        config.url?.split("?")[0] === endpoint &&
        config.data &&
        typeof config.data === "object" &&
        !(config.data instanceof FormData)
      )
        config.data = { ...config.data, expectedEditorVersion: version };
      return config;
    });
    return () => axios.interceptors.request.eject(interceptor);
  }, [endpoint, version]);
  return children;
}
