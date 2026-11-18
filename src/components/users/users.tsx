"use client";

import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import UsefulButton from "@/components/Button/usefulButton";
import DashBoardCommonHeader from "@/components/Header/DashBoardCommonHeader";
import LeftNavigation from "@/components/leftNavigation/leftNavigation";
import SearchIcon from "@/assets/SearchIcon.svg";
import UsersTable from "./UsersTable";
import ProductImage1 from "@/assets/productImages/productImage1.svg";
import { usePersistentData } from "@/hooks/usePersistentData";

const initialUsers = Array.from({ length: 5 }, (_, i) => ({
  id: (i + 1).toString(),
  poNumber: `User-${i + 1}`,
  status: {
    assigned: 1,
    unassigned: 3,
  },
  supplier: "System User",
  date: "03.10.2024",
  total: "$0.00",
  items: [
    {
      product: {
        name: "Activity Log Entry",
        image: ProductImage1,
      },
      status: "Unassigned",
      quantity: 1,
      purchaser: "Admin",
      property: "Main Office",
      unit: "N/A",
      cost: "$0.00",
    },
  ],
}));

const Users: React.FC = () => {
  const { data: users, addItem } = usePersistentData("users", initialUsers);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u: any) => 
    u.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.supplier.toLowerCase().includes(searchQuery.toLowerCase())
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
              Users
            </Typography>
            <Box sx={{ display: "flex", gap: "16px" }}>
              <UsefulButton label="Import" textColor="#6D6E6F" />
              <UsefulButton label="Export" textColor="#6D6E6F" />
            </Box>
          </Box>
          <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", padding: { xs: "14px", md: "18px" }, mb: "20px" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "24px", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography sx={{ color: "text.primary", fontSize: "14px", fontWeight: 600, cursor: "pointer", borderBottom: "2px solid", borderColor: "text.primary", pb: "4px" }}>
                  Active
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                  Inactive
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
                    placeholder="Search Users..." 
                    style={{ border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent", color: "inherit" }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </Box>
                <UsefulButton label="Filter" textColor="#6D6E6F" />
                <UsefulButton 
                  label="+ New User" 
                  textColor="#FFFFFF" 
                  backgroundColor="#000000" 
                  onClick={() => {
                    addItem({
                      id: Date.now().toString(),
                      poNumber: `User-${users.length + 1}`,
                      status: { assigned: 0, unassigned: 1 },
                      supplier: "New User",
                      date: new Date().toLocaleDateString(),
                      total: "$0.00",
                      items: []
                    });
                  }}
                />
              </Box>
            </Box>
            <UsersTable users={filteredUsers} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Users;
