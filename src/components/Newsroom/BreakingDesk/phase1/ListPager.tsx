"use client";

// Page controls under phase 1's New and Posted lists: "51–100 of 560" and the page numbers. Hidden while the list
// fits on one page, so a quiet day looks as it always did.

import React from "react";
import { Box, Pagination, Typography } from "@mui/material";
import { PAGE_SIZE, pageCount, rangeLabel } from "./paging";

const barSx = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", pt: 1.25 } as const;
const labelSx = { fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" } as const;
// 40px buttons on touch screens, the compact size from md up
const pagerSx = { "& .MuiPaginationItem-root": { minWidth: { xs: 40, md: 32 }, height: { xs: 40, md: 32 }, fontVariantNumeric: "tabular-nums" } } as const;

export default function ListPager({ page, total, onPage, label }: { page: number; total: number; onPage: (page: number) => void; label: string }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <Box component="nav" aria-label={label} sx={barSx}>
      {/* Not a live region: new stories change the total every few minutes and would be read out each time */}
      <Typography sx={labelSx}>
        {rangeLabel(page, total)}
      </Typography>
      <Pagination
        count={pageCount(total)}
        page={page + 1}
        onChange={(_, p) => onPage(p - 1)}
        size="small"
        siblingCount={1}
        boundaryCount={1}
        sx={pagerSx}
      />
    </Box>
  );
}
