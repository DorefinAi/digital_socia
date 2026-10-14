"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  IconButton,
  Typography,
  TextField,
  Paper,
  Avatar,
  Tooltip,
  Zoom,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CloseIcon from "@mui/icons-material/Close";

interface Message {
  text: string;
  isBot: boolean;
  timestamp: Date;
}

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#000" },
    background: { paper: "#fff", default: "#fff" },
    text: { primary: "#000", secondary: "#666" },
  },
  shape: { borderRadius: 12 },
});

export default function AgentAssistant() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setMessages([
      {
        text: "Good day! I'm your Personal Property Assistant. I've analyzed your latest dashboard data—is there anything specific you'd like me to look into for you?",
        isBot: true,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      text: inputValue,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    // Static response - no API call
    setTimeout(() => {
      const botMessage: Message = {
        text: "Thank you for your message. This is a demo version of the assistant. In the full version, I would analyze your property data and provide insights.",
        isBot: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    }, 500);
  };

  if (!mounted) return null;

  return (
    <ThemeProvider theme={lightTheme}>
      {/* Floating Toggle Button */}
      <Tooltip title="Talk to your Assistant" placement="left">
        <IconButton
          onClick={() => setIsOpen(!isOpen)}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            background: "black",
            color: "white",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            "&:hover": { transform: "scale(1.05)", background: "#333" },
            zIndex: 1100,
            animation: !isOpen ? "pulse 2s infinite" : "none",
            "@keyframes pulse": {
              "0%": { boxShadow: "0 0 0 0 rgba(0,0,0, 0.4)" },
              "70%": { boxShadow: "0 0 0 10px rgba(0,0,0, 0)" },
              "100%": { boxShadow: "0 0 0 0 rgba(0,0,0, 0)" }
            }
          }}
        >
          {isOpen ? <CloseIcon /> : <SmartToyIcon />}
        </IconButton>
      </Tooltip>

      {/* Floating Chat Window */}
      <Zoom in={isOpen}>
        <Paper
          elevation={12}
          sx={{
            position: "fixed",
            bottom: 90,
            right: 24,
            width: { xs: "90vw", sm: 320 },
            height: "480px",
            maxHeight: "70vh",
            borderRadius: "24px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            zIndex: 1100,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "white",
            boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2.5, bgcolor: "black", color: "white", display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar sx={{ bgcolor: "white", color: "black", width: 32, height: 32, fontWeight: 'bold' }}>
              P
            </Avatar>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Personal Assistant</Typography>
              <Typography variant="caption" sx={{ opacity: 0.7, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 6, height: 6, bgcolor: '#4caf50', borderRadius: '50%' }} />
                Online & Ready
              </Typography>
            </Box>
          </Box>

          {/* Messages */}
          <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.5, bgcolor: '#fff' }}>
            {messages.map((msg, idx) => (
              <Box key={idx} sx={{ alignSelf: msg.isBot ? "flex-start" : "flex-end", maxWidth: "85%" }}>
                <Paper
                  sx={{
                    p: 1.5,
                    borderRadius: msg.isBot ? "15px 15px 15px 4px" : "15px 15px 4px 15px",
                    bgcolor: msg.isBot ? "#f5f5f5" : "black",
                    color: msg.isBot ? "black" : "white",
                    boxShadow: "none",
                    border: msg.isBot ? "1px solid #eee" : "none",
                  }}
                >
                  <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{msg.text}</Typography>
                </Paper>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>

          {/* Footer Input */}
          <Box sx={{ p: 2, borderTop: "1px solid #eee", bgcolor: "white" }}>
            <TextField
              fullWidth
              size="small"
              placeholder="How can I help you, Vansh?"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              slotProps={{
                input: {
                  sx: {
                    borderRadius: "12px",
                    bgcolor: "#f9f9f9",
                    "& fieldset": { border: "none" },
                    fontSize: '0.9rem'
                  },
                  endAdornment: (
                    <IconButton onClick={handleSend} disabled={!inputValue.trim()} sx={{ color: 'black' }}>
                      <SendIcon fontSize="small" />
                    </IconButton>
                  )
                }
              }}
            />
          </Box>
        </Paper>
      </Zoom>
    </ThemeProvider>
  );
}
