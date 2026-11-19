"use client";

import { createContext, useContext } from "react";

const UjiSiswaContext = createContext<string | undefined>(undefined);

export function UjiSiswaContextProvider({ id, children }: { id?: string; children: React.ReactNode }) {
  return <UjiSiswaContext value={id}>{children}</UjiSiswaContext>;
}

export const useUjiSiswaId = () => useContext(UjiSiswaContext);
