"use client";

import React, { useEffect, useState } from "react";
import { Box, Button, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import { Copy, Eye, EyeOff, Sparkles } from "lucide-react";
import { PASSWORD_MIN, generatePassword } from "@/lib/access/password";

/**
 * A password an admin sets for someone else: show/hide, Generate and Copy.
 * The value lives only in the parent's state; nothing here stores or logs it.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Inline message; shown in place of the hint */
  error: string | null;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const [copy, setCopy] = useState<null | "copied" | "failed">(null);

  // The "Copied" note fades back to the hint after a moment
  useEffect(() => {
    if (!copy) return;
    const t = setTimeout(() => setCopy(null), 2500);
    return () => clearTimeout(t);
  }, [copy]);

  const generate = () => {
    onChange(generatePassword());
    // A generated password is meant to be read and shared, so it is shown
    setShown(true);
    setCopy(null);
  };

  const copyIt = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <Box>
      <TextField
        id={id}
        fullWidth
        size="small"
        label={label}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCopy(null);
        }}
        disabled={disabled}
        error={!!error}
        helperText={error ?? `At least ${PASSWORD_MIN} characters.`}
        autoComplete="new-password"
        inputRef={inputRef}
        slotProps={{
          htmlInput: { spellCheck: false, autoCapitalize: "off", autoCorrect: "off", "data-1p-ignore": true, "data-lpignore": "true" },
          input: {
            sx: { fontFamily: shown && value ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : undefined, letterSpacing: shown && value ? "0.04em" : undefined },
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title={shown ? "Hide password" : "Show password"}>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => setShown((s) => !s)}
                    aria-label={shown ? "Hide password" : "Show password"}
                    aria-pressed={shown}
                    aria-controls={id}
                    disabled={disabled}
                  >
                    {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          },
        }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" onClick={generate} disabled={disabled} startIcon={<Sparkles size={14} aria-hidden />} sx={{ borderColor: "divider", color: "text.primary", minHeight: 36 }}>
          Generate
        </Button>
        <Button size="small" variant="outlined" onClick={() => void copyIt()} disabled={disabled || !value} startIcon={<Copy size={14} aria-hidden />} sx={{ borderColor: "divider", color: "text.primary", minHeight: 36 }}>
          Copy
        </Button>
        <Typography role="status" aria-live="polite" sx={{ fontSize: "0.75rem", color: copy === "failed" ? "error.main" : "success.main", fontWeight: 600 }}>
          {copy === "copied" ? "Copied" : copy === "failed" ? "Couldn't copy. Select the password and copy it by hand." : ""}
        </Typography>
      </Box>
    </Box>
  );
}
