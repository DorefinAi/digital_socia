"use client";

import { Box, Typography, TextField } from "@mui/material";
import React, { useState, useEffect } from "react";

import LoginFormRightSectionImage from "@/assets/LoginFormRightSectionImage.png";
import { useAppDispatch } from "@/redux/hooks";
import { useRouter } from "next/navigation";
import ButtonComponent from "@/components/Button/Button";
import { loginUser } from "@/redux/slices/authSlice";

const LoginForm: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("admin@dashb.com");
  const [password, setPassword] = useState("password123");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const dispatch = useAppDispatch();

  useEffect(() => {
    setMounted(true);
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

  const handleClick = async () => {
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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        "& p": { mb: 0 },
      }}
    >
      <Box
        sx={{
          flex: { xs: "1", md: "1", lg: "0.6" },
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          p: { xs: 2, sm: 3, md: 4, lg: 5 },
        }}
      >
        <Box
          sx={{
            mb: { xs: 2, md: 4 },
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "inline-flex" }}>
            <img
              src="/vartaman-logo.png"
              alt="VARTAMAN AI Logo"
              style={{
                height: "44px",
                width: "auto",
                maxWidth: "100%",
                objectFit: "contain",
                objectPosition: "center",
                display: "block",
              }}
            />
          </Box>
        </Box>
        <Box
          sx={{
            maxWidth: "450px",
            width: "100%",
            mx: "auto",
            my: "auto",
            display: "flex",
            flexDirection: "column",
            gap: { xs: 2, sm: 2.5, md: 3 },
            minHeight: 0,
          }}
        >
          <Typography sx={{ textAlign: "center", fontWeight: 600 }}>
            Sign in to VARTAMAN AI
          </Typography>
          <TextField
            type="email"
            variant="outlined"
            label="Your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              validateEmail(e.target.value);
            }}
            error={!!emailError}
            helperText={emailError}
            fullWidth
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "32px" } }}
          />

          <TextField
            type="password"
            variant="outlined"
            label="Enter Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              validatePassword(e.target.value);
            }}
            error={!!passwordError}
            helperText={passwordError}
            fullWidth
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "32px" } }}
          />

          <ButtonComponent
            label="Sign in"
            onClick={handleClick}
            disabled={
              !email || !password || !!emailError || !!passwordError || loading
            }
          />

          <Typography sx={{ textAlign: "center", color: "text.primary" }}>
            <span
              style={{ color: "inherit", opacity: 0.7, fontSize: "16px", fontWeight: "500" }}
            >
              Need an account?{" "}
            </span>
            <span
              style={{
                textDecoration: "underline",
                color: "inherit",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign up
            </span>
          </Typography>
        </Box>

        <Typography
          sx={{
            textAlign: "center",
            mt: "auto",
            py: { xs: 1.5, md: 2 },
            px: 2,
            color: "text.secondary",
            fontSize: "14px",
            flexShrink: 0,
          }}
        >
          By proceeding you agree to the
          <span
            style={{
              textDecoration: "underline",
              color: "inherit",
              cursor: "pointer",
              margin: "0 3px",
            }}
          >
            {" "}
            Terms & Conditions{" "}
          </span>
          and
          <span
            style={{
              textDecoration: "underline",
              color: "inherit",
              cursor: "pointer",
              marginLeft: "3px",
            }}
          >
            {" "}
            Privacy Policy
          </span>
        </Typography>
      </Box>

      <Box
        sx={{
          flex: { xs: "1", md: "0.6" },
          display: { xs: "none", md: "flex" },
        }}
      >
        <img
          src={LoginFormRightSectionImage.src || LoginFormRightSectionImage as any}
          alt="Login Illustration"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      </Box>
    </Box>
  );
};

export default LoginForm;
