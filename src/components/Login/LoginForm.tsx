"use client";

import React, { useState } from "react";
import { Box, Typography, Button, IconButton, Alert } from "@mui/material";
import { Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/redux/hooks";
import { loginUser } from "@/redux/slices/authSlice";

const DEMO_EMAIL = "admin@dashb.com";
const DEMO_PASSWORD = "password123";
const RED = "#D7141A";
const YELLOW = "#FFD400";

// A slice of the desk's day, shown beside the form
const WIRE = [
  { time: "10:42", tag: "BIG BREAKING", headline: "जयपुर मेट्रो फेज-2 को कैबिनेट की मंजूरी", status: "Posted to X and Instagram" },
  { time: "10:31", tag: "BREAKING", headline: "कोटा में NEET अभ्यर्थियों का प्रदर्शन", status: "Posted to X" },
  { time: "10:20", tag: "BREAKING", headline: "बीकानेर सोलर पार्क ने पार किया 3,000 मेगावाट", status: "In the editor" },
  { time: "10:09", tag: "BREAKING", headline: "इंदिरा गांधी नहर में पानी बढ़ाया गया", status: "Fetched from FTP" },
];

const inputSx = {
  width: "100%",
  height: 40,
  px: 1.5,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "6px",
  backgroundColor: "background.paper",
  color: "text.primary",
  fontFamily: "inherit",
  fontSize: "0.875rem",
  outline: 0,
  transition: "border-color 120ms ease, box-shadow 120ms ease",
  "&:hover": { borderColor: "text.secondary" },
  "&:focus": { borderColor: "text.primary", boxShadow: "0 0 0 3px rgba(17,17,19,0.08)" },
  "&[aria-invalid='true']": { borderColor: "error.main" },
};

const labelSx = { display: "block", fontSize: "0.75rem", fontWeight: 600, mb: 0.5 };

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const dispatch = useAppDispatch();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "That email address is not valid";
    if (!password) next.password = "Enter your password";
    if (!next.email && !next.password && (email !== DEMO_EMAIL || password !== DEMO_PASSWORD)) {
      next.form = "Email or password is incorrect.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    dispatch(loginUser({ user: { id: "1", name: "Admin", email }, token: "static-token-for-demo" }));
    router.push("/dashboard");
  };

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setErrors({});
  };

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gridTemplateRows: { xs: "auto 1fr", md: "1fr" }, backgroundColor: "background.default" }}>
      {/* Desk panel */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, md: 4 }, p: { xs: 2.5, md: 5 }, backgroundColor: "#101012", color: "#fff" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: "8px", backgroundColor: RED, display: "grid", placeItems: "center", fontWeight: 700, fontSize: "0.9375rem" }}>V</Box>
          <Box>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.2 }}>Vartaman AI</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.3 }}>Digital desk · First India News</Typography>
          </Box>
        </Box>

        <Box sx={{ my: { md: "auto" }, maxWidth: 460 }}>
          <Typography component="h1" sx={{ fontSize: { xs: "1.25rem", md: "1.75rem" }, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
            Breaking stories, from the FTP to the feed.
          </Typography>
          <Typography sx={{ display: { xs: "none", md: "block" }, fontSize: "0.875rem", lineHeight: 1.6, color: "rgba(255,255,255,0.64)", mt: 1.25 }}>
            Tagged stories arrive with their pictures and video, already on the channel template. Edit the line, check the preview, post.
          </Typography>

          {/* Wire */}
          <Box sx={{ display: { xs: "none", md: "block" }, mt: 4, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {WIRE.map((row) => {
              const done = row.status.startsWith("Posted");
              return (
                <Box key={row.time} sx={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: 1.5, py: 1.5, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  <Typography sx={{ fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", color: "rgba(255,255,255,0.5)", pt: "2px" }}>{row.time}</Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.headline}</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                      <Box component="span" sx={{ px: 0.6, fontSize: "0.5625rem", fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1.7, borderRadius: "2px", backgroundColor: row.tag === "BIG BREAKING" ? YELLOW : RED, color: row.tag === "BIG BREAKING" ? "#111" : "#fff" }}>
                        {row.tag}
                      </Box>
                      <Typography sx={{ display: "flex", alignItems: "center", gap: 0.4, fontSize: "0.6875rem", color: done ? "#7BD88F" : "rgba(255,255,255,0.56)" }}>
                        {done && <Check size={11} />}
                        {row.status}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Typography sx={{ display: { xs: "none", md: "block" }, fontSize: "0.6875rem", color: "rgba(255,255,255,0.4)" }}>Internal tool. Access is managed by the desk admin.</Typography>
      </Box>

      {/* Form */}
      <Box sx={{ display: "flex", alignItems: { xs: "flex-start", md: "center" }, justifyContent: "center", p: { xs: 2.5, md: 5 } }}>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: "100%", maxWidth: 360 }}>
          <Typography component="h2" sx={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Sign in
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5, mb: 3 }}>Use your desk account to continue.</Typography>

          {errors.form && (
            <Alert severity="error" sx={{ mb: 2, py: 0, fontSize: "0.8125rem", borderRadius: "6px" }}>
              {errors.form}
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>
            <Box component="label" htmlFor="login-email" sx={labelSx}>
              Email
            </Box>
            <Box
              component="input"
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              sx={inputSx}
            />
            {errors.email && (
              <Typography id="login-email-error" sx={{ fontSize: "0.75rem", color: "error.main", mt: 0.5 }}>
                {errors.email}
              </Typography>
            )}
          </Box>

          <Box sx={{ mb: 2.5 }}>
            <Box component="label" htmlFor="login-password" sx={labelSx}>
              Password
            </Box>
            <Box sx={{ position: "relative" }}>
              <Box
                component="input"
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                sx={{ ...inputSx, pr: 5 }}
              />
              <IconButton
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                size="small"
                sx={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, borderRadius: "6px", color: "text.secondary" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            </Box>
            {errors.password && (
              <Typography id="login-password-error" sx={{ fontSize: "0.75rem", color: "error.main", mt: 0.5 }}>
                {errors.password}
              </Typography>
            )}
          </Box>

          <Button type="submit" variant="contained" fullWidth disabled={loading} endIcon={<ArrowRight size={16} />} sx={{ height: 40, fontWeight: 600, fontSize: "0.875rem" }}>
            {loading ? "Signing in" : "Sign in"}
          </Button>

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              Demo account: <Box component="span" sx={{ fontFamily: "var(--font-mono), monospace", color: "text.primary" }}>{DEMO_EMAIL}</Box>
            </Typography>
            <Button size="small" onClick={fillDemo} sx={{ minHeight: 28, fontSize: "0.75rem", flexShrink: 0 }}>
              Fill in
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginForm;
