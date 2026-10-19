"use client";

import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import XIcon from "@mui/icons-material/X";
import YouTubeIcon from "@mui/icons-material/YouTube";
import { Moon, Sun } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { useAppDispatch } from "@/redux/hooks";
import { useThemeMode } from "@/providers/MuiProvider";
import { useRouter } from "next/navigation";
import { loginUser } from "@/redux/slices/authSlice";
import { APP_NAME, CHANNEL } from "@/constants";
import SociaMark from "./SociaMark";

// Follows the app theme (useThemeMode), so the choice made here carries into
// the desk. Status colours are darker in light mode to keep AA contrast.
const PALETTES = {
  dark: {
    bg: "#08090b",
    card: "#111216",
    field: "rgba(255,255,255,0.03)",
    tile: "rgba(255,255,255,0.06)",
    hair: "rgba(255,255,255,0.08)",
    hair2: "rgba(255,255,255,0.14)",
    hairHover: "rgba(255,255,255,0.3)",
    ink: "#f4f5f7",
    ink2: "#a9acb5",
    ink3: "#80838d",
    btnHover: "#ffffff",
    btnDisabled: "rgba(255,255,255,0.12)",
    cardShadow: "0 40px 80px -40px rgba(0,0,0,0.9)",
    live: "#ff4d3d",
    wire: "#d92d20",
    approved: "#f5b544",
    posted: "#3fe0a5",
  },
  light: {
    bg: "#f6f6f7",
    card: "#ffffff",
    field: "#ffffff",
    tile: "rgba(0,0,0,0.05)",
    hair: "rgba(0,0,0,0.08)",
    hair2: "rgba(0,0,0,0.16)",
    hairHover: "rgba(0,0,0,0.35)",
    ink: "#0b0c0f",
    ink2: "#4b4e56",
    ink3: "#686b73",
    btnHover: "#2a2c32",
    btnDisabled: "rgba(0,0,0,0.08)",
    cardShadow: "0 30px 60px -36px rgba(0,0,0,0.25)",
    live: "#c4281c",
    wire: "#d92d20",
    approved: "#b45309",
    posted: "#047857",
  },
};

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

const CHANNELS = [
  { name: "X", handle: `@${CHANNEL.xHandle}`, Icon: XIcon },
  { name: "Instagram", handle: `@${CHANNEL.instagramHandle}`, Icon: InstagramIcon },
  { name: "YouTube", handle: CHANNEL.name, Icon: YouTubeIcon },
  { name: "Facebook", handle: CHANNEL.facebookPage, Icon: FacebookIcon },
];

const STAGES = [
  { label: "Drafting", tone: "ink3" },
  { label: "Approved", tone: "approved" },
  { label: "Posted", tone: "posted" },
] as const;

// Rundown plays once: each channel moves Drafting -> Approved -> Posted, a step
// behind the one above, then everything rests on Posted
const FINAL_STEP = CHANNELS.length - 1 + STAGES.length - 1;

const TICKER = [
  "FTP feed in, branded cards and clips out",
  "Approve once, publish to X, Instagram, YouTube and Facebook",
  "Schedule, undo and repost from one desk",
  "Every post tracked in the Digital Dashboard",
  "Web trends pulled in before the story breaks",
];

// Entrance: header, headline, form, rundown, ticker rise in that order
const rise = (step: number) => ({
  animation: `loginRise 0.7s ${EASE} both`,
  animationDelay: `${0.05 + step * 0.08}s`,
});

const istTime = () =>
  new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

const LoginForm: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("admin@dashb.com");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [clock, setClock] = useState("");

  const router = useRouter();
  const dispatch = useAppDispatch();
  const { mode, toggleTheme } = useThemeMode();
  const C = PALETTES[mode];

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: C.ink },
          error: { main: C.live },
          background: { default: C.bg, paper: C.card },
          text: { primary: C.ink, secondary: C.ink2 },
        },
        typography: { fontFamily: "var(--font-roboto), var(--font-devanagari), 'Nirmala UI', system-ui, sans-serif" },
      }),
    [mode, C]
  );

  useEffect(() => {
    setMounted(true);
    setClock(istTime());
    const clockTimer = setInterval(() => setClock(istTime()), 15000);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(FINAL_STEP);
      return () => clearInterval(clockTimer);
    }

    let rundownTimer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      rundownTimer = setInterval(() => {
        setStep((s) => {
          if (s + 1 >= FINAL_STEP && rundownTimer) clearInterval(rundownTimer);
          return Math.min(s + 1, FINAL_STEP);
        });
      }, 650);
    }, 900);

    return () => {
      clearInterval(clockTimer);
      clearTimeout(start);
      if (rundownTimer) clearInterval(rundownTimer);
    };
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError("Email is required");
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError("Password is required");
      return false;
    } else if (password.length < 5) {
      setPasswordError("Password must be at least 5 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (isEmailValid && isPasswordValid) {
      setLoading(true);

      // Static login - accept admin@dashb.com / password123
      if (email === "admin@dashb.com" && password === "password123") {
        dispatch(
          loginUser({
            user: { id: "1", name: "Admin", email: "admin@dashb.com" },
            token: "static-token-for-demo",
          })
        );
        router.push("/dashboard");
      } else {
        setPasswordError("Invalid credentials. Use admin@dashb.com / password123");
      }

      setLoading(false);
    }
  };

  if (!mounted) return null;

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: C.field,
      "& fieldset": { borderColor: C.hair2 },
      "&:hover fieldset": { borderColor: C.hairHover },
      "&.Mui-focused fieldset": { borderColor: C.ink, borderWidth: "1px" },
    },
    "& .MuiInputLabel-root": { color: C.ink3 },
    "& .MuiInputLabel-root.Mui-focused": { color: C.ink },
    "& input:-webkit-autofill": {
      WebkitBoxShadow: `0 0 0 100px ${C.card} inset`,
      WebkitTextFillColor: C.ink,
      caretColor: C.ink,
    },
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          // Exactly one screen tall, so the login never scrolls. Below, the extras drop out as the
          // screen gets shorter; only a screen too short for the sign-in card (a phone on its side)
          // lets the middle area scroll, so Sign in is always reachable.
          height: "100dvh",
          display: "grid",
          // minmax(0, 1fr) stops the ticker's max-content track from widening the page
          gridTemplateColumns: "minmax(0, 1fr)",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          bgcolor: C.bg,
          color: C.ink,
          overflow: "hidden",
          "& p": { mb: 0 },
          "@keyframes loginRise": {
            from: { opacity: 0, transform: "translateY(14px)" },
            to: { opacity: 1, transform: "none" },
          },
          "@keyframes loginTicker": {
            from: { transform: "translateX(0)" },
            to: { transform: "translateX(-50%)" },
          },
          "@media (prefers-reduced-motion: reduce)": {
            "& *": { animation: "none !important", transition: "none !important" },
          },
        }}
      >
        {/* Top bar */}
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: { xs: 2, sm: 4, md: 6 },
            py: { xs: 2, md: 3 },
            "@media (max-height: 759.95px)": { py: 1.25 },
            ...rise(0),
          }}
        >
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1.25 }}>
            <SociaMark size={28} />
            <Typography component="span" sx={{ fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
              {APP_NAME}
            </Typography>
          </Box>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
            <Typography
              component="span"
              sx={{ fontSize: "0.8125rem", color: C.ink3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
            >
              {clock} IST
            </Typography>
            <IconButton
              onClick={toggleTheme}
              aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              sx={{
                width: 44,
                height: 44,
                color: C.ink2,
                border: `1px solid ${C.hair2}`,
                borderRadius: "12px",
                "&:hover": { color: C.ink, bgcolor: C.tile },
                "&.Mui-focusVisible": { outline: `2px solid ${C.ink}`, outlineOffset: 2 },
              }}
            >
              {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
          </Box>
        </Box>

        {/* Phone: headline, form, rundown stacked. Desktop: pitch left, form right */}
        <Box
          component="main"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1.15fr) minmax(340px, 420px)" },
            gridTemplateAreas: { xs: '"pitch" "form" "rundown"', md: '"pitch form" "rundown form"' },
            // Tablet: headline across the top, form and rundown side by side
            "@media (min-width: 700px) and (max-width: 899.95px)": {
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gridTemplateAreas: '"pitch pitch" "form rundown"',
              columnGap: 3,
              alignItems: "start",
            },
            alignContent: "center",
            columnGap: { md: 6, lg: 12 },
            rowGap: { xs: 3, sm: 4, md: 5 },
            width: "100%",
            maxWidth: 1200,
            mx: "auto",
            px: { xs: 2, sm: 4, md: 6 },
            pt: { xs: 1, md: 4 },
            pb: { xs: 4, md: 6 },
            minHeight: 0,
            overflowY: "auto",
            "@media (max-height: 759.95px)": { pt: 0, pb: 2, rowGap: 2 },
            "@media (max-height: 699.95px)": { pb: 1.5, rowGap: 1.5 },
          }}
        >
          <Box sx={{ gridArea: "pitch", minWidth: 0, alignSelf: { md: "end" } }}>
            <Typography
              component="h1"
              sx={{
                // Sized by height as well as width, so a short laptop screen gets a shorter headline
                fontSize: "clamp(2rem, min(1.2rem + 4.6vw, 8.5vh), 4.5rem)",
                "@media (max-height: 699.95px)": { fontSize: "clamp(2rem, min(1.2rem + 4.6vw, 7vh), 4.5rem)" },
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                m: 0,
                ...rise(1),
              }}
            >
              Every story.
              <Box component="span" sx={{ display: "block", color: C.ink3 }}>
                Every channel.
              </Box>
            </Typography>

            <Typography
              sx={{
                mt: { xs: 1.5, md: 3 },
                maxWidth: 500,
                fontSize: "clamp(0.9375rem, 0.88rem + 0.25vw, 1.0625rem)",
                lineHeight: 1.6,
                color: C.ink2,
                ...rise(2),
                // The headline says enough when the screen is short
                "@media (max-height: 699.95px), (max-width: 699.95px) and (max-height: 799.95px)": { display: "none" },
              }}
            >
              {APP_NAME} turns the First India News feed into posts for X, Instagram, YouTube and
              Facebook, then drafts, approves and publishes them from one desk.
            </Typography>
          </Box>

          {/* Sign-in card: the one raised surface on the page */}
          <Box
            component="form"
            noValidate
            onSubmit={handleSubmit}
            sx={{
              gridArea: "form",
              alignSelf: "center",
              width: "100%",
              maxWidth: { xs: 480, md: "none" },
              "@media (min-width: 700px)": { maxWidth: "none" },
              p: { xs: 2.5, sm: 4 },
              "@media (max-height: 699.95px)": { p: 2.5, gap: 2 },
              borderRadius: "20px",
              border: `1px solid ${C.hair2}`,
              bgcolor: C.card,
              boxShadow: C.cardShadow,
              display: "flex",
              flexDirection: "column",
              gap: 2.25,
              ...rise(3),
            }}
          >
            <Box>
              <Typography component="h2" sx={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", m: 0 }}>
                Sign in to the desk
              </Typography>
              <Typography sx={{ mt: 0.75, color: C.ink2, fontSize: "0.875rem" }}>
                Use your newsroom account.
              </Typography>
            </Box>

            <TextField
              type="email"
              label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                validateEmail(e.target.value);
              }}
              error={!!emailError}
              helperText={emailError}
              fullWidth
              sx={fieldSx}
            />

            <TextField
              type={showPassword ? "text" : "password"}
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                validatePassword(e.target.value);
              }}
              error={!!passwordError}
              helperText={passwordError}
              fullWidth
              sx={fieldSx}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        sx={{ width: 44, height: 44, color: C.ink3 }}
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              disabled={!email || !password || !!emailError || !!passwordError || loading}
              sx={{
                mt: 0.5,
                minHeight: 50,
                borderRadius: "12px",
                bgcolor: C.ink,
                color: C.bg,
                fontSize: "0.9375rem",
                fontWeight: 700,
                textTransform: "none",
                transition: `transform 0.16s ${EASE}, background-color 0.16s ${EASE}`,
                "&:hover": { bgcolor: C.btnHover },
                "&:active": { transform: "scale(0.98)" },
                "&.Mui-focusVisible": { outline: `2px solid ${C.ink}`, outlineOffset: 3 },
                "&.Mui-disabled": { bgcolor: C.btnDisabled, color: C.ink3 },
              }}
            >
              Sign in
            </Button>

            <Typography sx={{ textAlign: "center", color: C.ink3, fontSize: "0.8125rem" }}>
              No account yet? Ask your desk admin for access.
            </Typography>
          </Box>

          {/* How one story goes out: plays once on load, then rests on Posted */}
          <Box
            sx={{
              gridArea: "rundown",
              minWidth: 0,
              alignSelf: { md: "start" },
              ...rise(4),
              // On phones it sits under the form, and on short laptop screens under the headline;
              // either way it would push the page past one screen, so it drops out there
              "@media (max-width: 699.95px)": { display: "none" },
              "@media (min-width: 900px) and (max-height: 839.95px)": { display: "none" },
            }}
          >
            <Box
              role="img"
              aria-label="One story moving from drafting to posted on X, Instagram, YouTube and Facebook"
              sx={{
                maxWidth: { xs: 480, md: 500 },
                "@media (min-width: 700px) and (max-width: 899.95px)": { maxWidth: "none" },
                borderRadius: "16px",
                border: `1px solid ${C.hair}`,
                overflow: "hidden",
              }}
            >
              <Typography
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: `1px solid ${C.hair}`,
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: C.ink2,
                }}
              >
                One story, four channels
              </Typography>
              {CHANNELS.map(({ name, handle, Icon }, i) => {
                const stage = STAGES[Math.max(0, Math.min(step - i, STAGES.length - 1))];
                const stageColor = C[stage.tone];
                return (
                  <Box
                    key={name}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "32px minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      "& + &": { borderTop: `1px solid ${C.hair}` },
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "8px",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: C.tile,
                        "& svg": { fontSize: 17 },
                      }}
                    >
                      <Icon />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{name}</Typography>
                      <Typography noWrap sx={{ fontSize: "0.75rem", color: C.ink3 }}>
                        {handle}
                      </Typography>
                    </Box>
                    <Box
                      key={stage.label}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: stageColor,
                        animation: `loginRise 0.4s ${EASE} both`,
                      }}
                    >
                      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: stageColor }} />
                      {stage.label}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Wire ticker: the page's one running motif, the newsroom's own idiom */}
        <Box component="footer" sx={{ ...rise(5) }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "stretch",
              borderTop: `1px solid ${C.hair}`,
              borderBottom: `1px solid ${C.hair}`,
              overflow: "hidden",
              "&:hover .login-ticker": { animationPlayState: "paused" },
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                px: { xs: 1.5, sm: 2 },
                bgcolor: C.wire,
                color: "#fff",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
            >
              {APP_NAME} wire
            </Box>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                maskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
                WebkitMaskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
              }}
            >
              <Box
                className="login-ticker"
                sx={{
                  display: "flex",
                  width: "max-content",
                  py: 1.25,
                  animation: "loginTicker 45s linear infinite",
                }}
              >
                {[...TICKER, ...TICKER].map((line, i) => (
                  <Box
                    key={i}
                    component="span"
                    aria-hidden={i >= TICKER.length}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      pr: 3,
                      fontSize: "0.8125rem",
                      color: C.ink2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {line}
                    <Box component="span" sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: C.ink3 }} />
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Typography sx={{ textAlign: "center", py: 1.75, px: 2, color: C.ink3, fontSize: "0.75rem", "@media (max-height: 759.95px)": { py: 1 } }}>
            By signing in you agree to the Terms & Conditions and Privacy Policy.
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default LoginForm;
