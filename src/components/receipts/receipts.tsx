"use client";

import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import UsefulButton from "@/components/Button/usefulButton";
import DashBoardCommonHeader from "@/components/Header/DashBoardCommonHeader";
import LeftNavigation from "@/components/leftNavigation/leftNavigation";
import SearchIcon from "@/assets/SearchIcon.svg";
import ReceiptTable from "./ReceiptTable";
import ProductImage1 from "@/assets/productImages/productImage1.svg";
import { usePersistentData } from "@/hooks/usePersistentData";

const initialReceipts = Array.from({ length: 5 }, (_, i) => ({
  id: (i + 1).toString(),
  poNumber: `HD-203923${i + 1}`,
  status: {
    assigned: 1,
    unassigned: 3,
  },
  supplier: "The Home Depot",
  date: "03.10.2024",
  total: "$35,000.00",
  items: [
    {
      product: {
        name: "TNOMS Black Bathroom Faucet Set of 4",
        image: ProductImage1,
      },
      status: "Unassigned",
      quantity: 860,
      receipt: "Jake Harrison",
      property: "Property Name",
      unit: "Unit Name",
      cost: "$12,000.00",
    },
  ],
}));

const Receipts: React.FC = () => {
  const { data: receipts } = usePersistentData("receipts", initialReceipts);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredReceipts = receipts.filter((r: any) => 
    r.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.supplier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, width: "100%", minHeight: "100vh", gap: { xs: 0, lg: "12px" }, backgroundColor: "background.default" }}>
      <Box sx={{ flexShrink: 0 }}>
        <LeftNavigation />
      </Box>
      <Box sx={{ flexGrow: 1, px: { xs: "14px", md: "20px" }, paddingBottom: "20px" }}>
        <DashBoardCommonHeader />
        <Box sx={{ mt: "24px", width: "100%", maxWidth: "1100px", mx: "auto" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "24px" }}>
            <Typography sx={{ color: "text.primary", fontSize: "1.125rem", fontWeight: 600 }}>
              Receipts
            </Typography>
            <Box sx={{ display: "flex", gap: "16px" }}>
              <UsefulButton label="Import" textColor="#6D6E6F" />
              <UsefulButton label="Export" textColor="#6D6E6F" />
            </Box>
          </Box>
          <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", padding: { xs: "14px", md: "18px" }, mb: "20px" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "24px", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography sx={{ color: "text.secondary", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                  Items
                </Typography>
                <Typography sx={{ color: "text.primary", fontSize: "14px", fontWeight: 600, cursor: "pointer", borderBottom: "2px solid", borderColor: "text.primary", pb: "4px" }}>
                  Receipts
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "24px",
                    px: 2,
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <img src={SearchIcon.src || SearchIcon as any} width="20" height="20" alt="search" style={{ filter: "grayscale(1)" }} />
                  <input 
                    placeholder="Search Receipts..." 
                    style={{ border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent", color: "inherit" }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </Box>
                <UsefulButton label="Filter" textColor="#6D6E6F" />
                <UsefulButton label="Assign" textColor="#FFFFFF" backgroundColor="#6D6E6F" />
              </Box>
            </Box>
            <ReceiptTable receipts={filteredReceipts} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Receipts;
