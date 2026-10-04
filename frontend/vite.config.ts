import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @zerodev/sdk does `class KernelEIP1193Provider extends EventEmitter` using Node's built-in "events".
    // Vite stubs Node built-ins to an empty object in the browser, which makes that class extend `undefined`
    // and throws at import time ("Class extends value undefined"). Use the npm browser implementation instead.
    alias: [{ find: /^events$/, replacement: "events/events.js" }],
  },
  optimizeDeps: {
    include: ["events"],
  },
});
