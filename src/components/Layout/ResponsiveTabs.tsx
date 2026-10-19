"use client";

import React from "react";
import { Box, Tab, Tabs } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

export interface ResponsiveTabItem<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: ResponsiveTabItem<T>[];
  ariaLabel: string;
  /** Extra styles for the sm-and-up Tabs bar */
  tabsSx?: SxProps<Theme>;
}

/**
 * Tabs from sm up; on phones the same choices wrap onto as many rows as they
 * need, so no option hides behind a sideways scroll.
 */
export default function ResponsiveTabs<T extends string>({ value, onChange, items, ariaLabel, tabsSx }: Props<T>) {
  return (
    <>
      <Box role="tablist" aria-label={ariaLabel} sx={{ display: { xs: "flex", sm: "none" }, flexWrap: "wrap", gap: 0.75, py: 0.75 }}>
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <Box
              key={item.value}
              component="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(item.value)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                minHeight: 40,
                px: 1.5,
                border: "1px solid",
                borderColor: selected ? "text.primary" : "divider",
                borderRadius: "8px",
                backgroundColor: selected ? "text.primary" : "transparent",
                color: selected ? "background.paper" : "text.secondary",
                fontFamily: "inherit",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
                "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 2 },
              }}
            >
              {item.icon}
              {item.label}
            </Box>
          );
        })}
      </Box>
      <Tabs
        value={value}
        onChange={(_, v) => onChange(v)}
        aria-label={ariaLabel}
        variant="scrollable"
        scrollButtons={false}
        sx={[{ display: { xs: "none", sm: "flex" } }, ...(Array.isArray(tabsSx) ? tabsSx : [tabsSx])]}
      >
        {items.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} icon={item.icon ? <Box sx={{ display: "flex" }}>{item.icon}</Box> : undefined} iconPosition="start" />
        ))}
      </Tabs>
    </>
  );
}
