"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import { useInterval } from "usehooks-ts";

type TNowContext = number;

const NowContext = createContext<TNowContext | null>(null);
const INITIAL_NOW = Date.now();

export const NowProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const [now, setNow] = useState(INITIAL_NOW);

  useInterval(() => {
    setNow(Date.now());
  }, 250);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
};

export const useNow = () => {
  const context = useContext(NowContext);
  if (context === null) {
    throw new Error("useNow must be used within an NowProvider");
  }
  return context;
};

export default NowProvider;
