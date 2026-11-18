"use client";

// The assistant's chat window. Loaded on its own (Chatbot.tsx) the first time someone opens it, so pages
// that never open the assistant don't download it. Once loaded it stays mounted, so closing and reopening
// keeps the conversation, as before.
import React, { useState, useRef, useEffect } from "react";
import { Box, IconButton, Typography, TextField, Paper, Avatar, Zoom } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface Message {
  text: string;
  isBot: boolean;
  timestamp: Date;
}

export default function ChatPanel({ open, firstName }: { open: boolean; firstName: string }) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      text: "Good day! I'm your Personal Property Assistant. I've analyzed your latest dashboard data—is there anything specific you'd like me to look into for you?",
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

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

  return (
    <>
      {/* Floating Chat Window */}
      <Zoom in={open}>
        <Paper
          elevation={12}
          sx={{
            position: "fixed",
            bottom: 72,
            right: 16,
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
              placeholder={firstName ? `How can I help you, ${firstName}?` : "How can I help you?"}
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
    </>
  );
}
