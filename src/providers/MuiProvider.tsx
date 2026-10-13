"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import AgentAssistant from "@/components/Chat/Chatbot";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  toggleTheme: () => {},
});

export const useThemeMode = () => useContext(ThemeContext);

export default function MuiProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedMode = localStorage.getItem("themeMode") as ThemeMode;
    if (savedMode) {
      setMode(savedMode);
    }
  }, []);

  const toggleTheme = () => {
    const newMode = mode === "light" ? "dark" : "light";
    setMode(newMode);
    localStorage.setItem("themeMode", newMode);
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === "light" ? "#111113" : "#F4F4F5",
          },
          secondary: {
            main: "#D7141A",
          },
          background: {
            default: mode === "light" ? "#F5F5F3" : "#0E0E10",
            paper: mode === "light" ? "#ffffff" : "#18181B",
          },
          text: {
            primary: mode === "light" ? "#111113" : "#F4F4F5",
            secondary: mode === "light" ? "#62636A" : "#A1A1AA",
          },
          divider: mode === "light" ? "#E6E5E1" : "#2A2A2E",
        },
        typography: {
          fontFamily: `var(--font-sans), var(--font-deva), "Nirmala UI", system-ui, sans-serif`,
          fontSize: 13,
          body1: {
            fontSize: "0.875rem",
            lineHeight: 1.45,
          },
          body2: {
            fontSize: "0.8125rem",
            lineHeight: 1.45,
          },
          h1: {
            fontSize: "1.75rem",
            lineHeight: 1.2,
          },
          h2: {
            fontSize: "1.5rem",
            lineHeight: 1.2,
          },
          h3: {
            fontSize: "1.25rem",
            lineHeight: 1.25,
          },
          button: {
            fontSize: "0.8125rem",
            fontWeight: 600,
          },
        },
        components: {
          MuiTypography: {
            styleOverrides: {
              root: {
                marginBottom: 0,
              },
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: {
                borderRadius: "6px",
                textTransform: "none",
                minHeight: 34,
                fontSize: "0.8125rem",
              },
            },
          },
          MuiInputBase: {
            styleOverrides: {
              root: {
                fontSize: "0.875rem",
              },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                fontSize: "0.8125rem",
                lineHeight: 1.4,
                padding: "10px 14px",
              },
              head: {
                fontSize: "0.75rem",
                fontWeight: 700,
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                borderRadius: "8px",
              },
            },
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
        <AgentAssistant />
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
