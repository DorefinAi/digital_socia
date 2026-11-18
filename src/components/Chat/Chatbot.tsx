"use client";

import React, { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { IconButton, Tooltip, ThemeProvider, createTheme } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CloseIcon from "@mui/icons-material/Close";
import { usePermissions } from "@/lib/access/usePermissions";

// The chat window is its own chunk, fetched only when the assistant is first opened (or hovered/focused,
// so it is usually ready by the click). Only the launcher button below ships with every page.
const ChatPanel = dynamic(() => import("./ChatPanel"), { ssr: false });
const preloadPanel = () => void import("./ChatPanel");

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#000" },
    background: { paper: "#fff", default: "#fff" },
    text: { primary: "#000", secondary: "#666" },
  },
  shape: { borderRadius: 12 },
});

const subscribeNothing = () => () => {};

export default function AgentAssistant() {
  // Client only: the assistant never renders on the server
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [isOpen, setIsOpen] = useState(false);
  // Becomes true on the first open and stays true, so the window (and its chat) is never unmounted again
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();
  // The signed-in person's first name; a neutral prompt until /me has answered
  const firstName = usePermissions().user?.name.trim().split(/\s+/)[0] ?? "";

  // No assistant on the login page
  if (!mounted || pathname === "/") return null;

  return (
    <ThemeProvider theme={lightTheme}>
      {/* Floating Toggle Button */}
      <Tooltip title="Talk to your Assistant" placement="left">
        <IconButton
          onClick={() => {
            setLoaded(true);
            setIsOpen(!isOpen);
          }}
          onMouseEnter={preloadPanel}
          onFocus={preloadPanel}
          sx={{
            position: "fixed",
            // Small and tucked into the corner, so it never sits over a page's own buttons
            bottom: 16,
            right: 16,
            width: 44,
            height: 44,
            background: "black",
            color: "white",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            "&:hover": { transform: "scale(1.05)", background: "#333" },
            zIndex: 1100,
            // The ring grows with transform and opacity, which the GPU animates without repainting every page it sits on
            "&::after": { content: '""', position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.4)", pointerEvents: "none", animation: !isOpen ? "pulse 2s ease-out infinite" : "none", opacity: 0 },
            "&:hover::after": { animation: "none" },
            "@keyframes pulse": {
              "0%": { transform: "scale(1)", opacity: 1 },
              "70%, 100%": { transform: "scale(1.36)", opacity: 0 }
            },
            "@media (prefers-reduced-motion: reduce)": { "&::after": { animation: "none" } }
          }}
        >
          {isOpen ? <CloseIcon sx={{ fontSize: 20 }} /> : <SmartToyIcon sx={{ fontSize: 20 }} />}
        </IconButton>
      </Tooltip>

      {/* Floating Chat Window: loaded the first time it is opened, then kept mounted */}
      {loaded && <ChatPanel open={isOpen} firstName={firstName} />}
    </ThemeProvider>
  );
}
