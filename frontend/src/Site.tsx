import { useEffect, useState } from "react";
import App from "./App";
import Landing from "./Landing";

const isApp = () => window.location.hash.startsWith("#/app");

/** Hash routing: "#/app" is the dApp, anything else is the marketing home page. */
export default function Site() {
  const [app, setApp] = useState(isApp);
  useEffect(() => {
    const onHash = () => {
      setApp(isApp());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return app ? <App /> : <Landing />;
}
