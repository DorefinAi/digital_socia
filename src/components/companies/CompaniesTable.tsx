"use client";

import React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Avatar,
  Typography,
} from "@mui/material";
import { MoreVert as MoreVertIcon } from "@mui/icons-material";

const CompaniesTable: React.FC<{ data: any[] }> = ({ data }) => {
  return (
    <TableContainer component={Paper} sx={{ boxShadow: "none", borderRadius: "16px" }}>
      <Table sx={{ minWidth: 800 }}>
        <TableHead>
          <TableRow>
            <TableCell>Company Name</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Properties</TableCell>
            <TableCell>Users</TableCell>
            <TableCell>Contact Email</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((company) => (
            <TableRow key={company.id} sx={{ "&:hover": { backgroundColor: "action.hover" } }}>
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Avatar sx={{ bgcolor: "#E5E7EB", color: "#374151", fontWeight: 600 }}>
                    {company.name.charAt(0)}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: "14px" }}>{company.name}</Typography>
                    <Typography sx={{ fontSize: "12px", color: "#6D6E6F" }}>{company.address}</Typography>
                  </Box>
                </Box>
              </TableCell>
              <TableCell>
                <Chip
                  label={company.status}
                  size="small"
                  sx={{
                    backgroundColor: company.status === "Active" ? "#E8F5E9" : "#FFEBEE",
                    color: company.status === "Active" ? "#2E7D32" : "#C62828",
                  }}
                />
              </TableCell>
              <TableCell>{company.properties}</TableCell>
              <TableCell>{company.users}</TableCell>
              <TableCell>{company.email}</TableCell>
              <TableCell align="right">
                <IconButton size="small">
                  <MoreVertIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CompaniesTable;
