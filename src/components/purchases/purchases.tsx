"use client";

import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import UsefulButton from "@/components/Button/usefulButton";
import DashBoardCommonHeader from "@/components/Header/DashBoardCommonHeader";
import LeftNavigation from "@/components/leftNavigation/leftNavigation";
import SearchIcon from "@/assets/SearchIcon.svg";
import PurchaseTable from "./purchasesTable";
import ProductImage1 from "@/assets/productImages/productImage1.svg";
import { useRouter } from "next/navigation";
import { usePersistentData } from "@/hooks/usePersistentData";
import AddPurchaseModal from "./AddPurchaseModal";

const initialPurchases = Array.from({ length: 5 }, (_, i) => ({
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
      purchaser: "Jake Harrison",
      property: "Property Name",
      unit: "Unit Name",
      cost: "$12,000.00",
    },
  ],
}));

const Purchases: React.FC = () => {
  const [view, setView] = useState("items");
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const { data: purchases, addItem } = usePersistentData("purchases", initialPurchases);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPurchases = purchases.filter((p: any) => 
    p.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.supplier.toLowerCase().includes(searchQuery.toLowerCase())
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
              Purchases
            </Typography>
            <Box sx={{ display: "flex", gap: "16px" }}>
              <UsefulButton label="Import" textColor="#6D6E6F" />
              <UsefulButton label="Export" textColor="#6D6E6F" />
            </Box>
          </Box>
          <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", padding: { xs: "14px", md: "18px" }, mb: "20px" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "24px", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography 
                  onClick={() => setView("items")}
                  sx={{ 
                    color: view === "items" ? "text.primary" : "text.secondary", 
                    fontSize: "14px", 
                    fontWeight: 600, 
                    cursor: "pointer",
                    borderBottom: view === "items" ? "2px solid" : "none",
                    borderColor: "text.primary",
                    pb: "4px"
                  }}
                >
                  Items
                </Typography>
                <Typography 
                  onClick={() => router.push("/receipts")}
                  sx={{ 
                    color: "text.secondary", 
                    fontSize: "14px", 
                    fontWeight: 600, 
                    cursor: "pointer",
                    pb: "4px"
                  }}
                >
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
                    placeholder="Search PO or Supplier..." 
                    style={{ border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent", color: "inherit" }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </Box>
                <UsefulButton label="Filter" textColor="#6D6E6F" />
                <UsefulButton label="Assign" textColor="#FFFFFF" backgroundColor="#6D6E6F" onClick={() => setModalOpen(true)} />
              </Box>
            </Box>
            <PurchaseTable purchases={filteredPurchases} />
          </Box>
        </Box>
      </Box>
      <AddPurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={addItem} />
    </Box>
  );
};

export default Purchases;
