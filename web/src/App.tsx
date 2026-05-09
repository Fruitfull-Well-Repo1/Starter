import { useState } from "react";
import { Inbox } from "./pages/Inbox.tsx";
import { Recent } from "./pages/Recent.tsx";
import { Settings } from "./pages/Settings.tsx";

type Tab = "inbox" | "recent" | "settings";

const TITLES: Record<Tab, string> = {
  inbox: "Inbox",
  recent: "Recent",
  settings: "Settings",
};

export function App() {
  const [tab, setTab] = useState<Tab>("inbox");

  return (
    <div className="app">
      <header className="app-header">
        <h1>{TITLES[tab]}</h1>
        <span className="badge">PB Reply</span>
      </header>

      {tab === "inbox" && <Inbox />}
      {tab === "recent" && <Recent />}
      {tab === "settings" && <Settings />}

      <nav className="tabs">
        {(Object.keys(TITLES) as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {TITLES[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}
