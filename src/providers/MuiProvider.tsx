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
            main: mode === "light" ? "#000000" : "#ffffff",
          },
          background: {
            default: mode === "light" ? "#f8f9fa" : "#121212",
            paper: mode === "light" ? "#ffffff" : "#1e1e1e",
          },
          text: {
            primary: mode === "light" ? "#000000" : "#ffffff",
            secondary: mode === "light" ? "#6D6E6F" : "#b0b0b0",
          },
        },
        typography: {
          fontFamily: "Inter, sans-serif",
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
            styleOverrides: {
              root: {
                borderRadius: "12px",
                textTransform: "none",
                minHeight: 38,
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
                borderRadius: "12px",
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
