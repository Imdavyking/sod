import "reflect-metadata";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@zerodev/wallet-react-ui/styles.css";
import Site from "./Site";
import { wagmiConfig } from "./lib/wagmi";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
        <Site />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
