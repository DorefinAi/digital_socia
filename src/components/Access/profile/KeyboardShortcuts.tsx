"use client";

// The person's own keyboard shortcuts. Changes are a draft until "Save shortcuts" (PUT /me/key-bindings); the
// desk's key handlers and hints follow the saved keys at once, without a reload.

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Switch, Typography } from "@mui/material";
import { Keyboard, Lock } from "lucide-react";
import { ApiError } from "@/lib/socia/client";
import { accessService } from "@/lib/access/service";
import { usePhase } from "@/lib/socia/usePhase";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { type EditorKey, editorKeyLabel, editorKeyName, eventKey, profileKeyGroups } from "@/components/Newsroom/BreakingDesk/editorKeys";
import {
  comboCaps,
  comboProblem,
  comboSpoken,
  type KeyBindingMap,
  MAX_COMBOS,
  sameMap,
  sanitizeBindings,
  setKeyBindingOverrides,
  useKeyBindings,
} from "@/components/Newsroom/BreakingDesk/keyBindings";
import { Keycap, SectionCard } from "./parts";

const bindId = (k: EditorKey) => k.bind ?? k.id;
const draftKeys = (k: EditorKey, draft: KeyBindingMap) => (k.fixed ? k.keys : Object.prototype.hasOwnProperty.call(draft, bindId(k)) ? draft[bindId(k)] : k.keys);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** Only what differs from the defaults goes to the server */
function cleanDraft(draft: KeyBindingMap, all: EditorKey[]): KeyBindingMap {
  const out: KeyBindingMap = {};
  for (const k of all) {
    if (k.fixed || !Object.prototype.hasOwnProperty.call(draft, bindId(k))) continue;
    if (!sameList(draft[bindId(k)], k.keys)) out[bindId(k)] = draft[bindId(k)];
  }
  return out;
}

/** What went wrong with a save, in the desk's words (the server's own message for clashes and bad keys) */
function saveErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return errorText(err);
  if (err.code === "key_clash" || err.code === "invalid") return err.message || "Two actions share a key, or a key isn't valid. Check the rows marked in red.";
  if (err.code === "rate_limited") return "Too many saves in a minute. Wait a minute, then save again.";
  if (err.code === "totp_required") return "Finish two-step sign-in first, then save your shortcuts.";
  return errorText(err);
}

const MODIFIER_KEYS =new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Unidentified", "Process", "OS", "Fn", "AltGraph", "Hyper", "Super"]);

function Combo({ combo }: { combo: string }) {
  const caps = comboCaps(combo);
  return (
    <Box component="span" role="img" aria-label={comboSpoken(combo)} sx={{ display: "inline-flex", alignItems: "center", gap: 0.375 }}>
      {caps.map((c, i) => (
        <Keycap key={i}>{c}</Keycap>
      ))}
    </Box>
  );
}

function KeyList({ keys, fixed, shown }: { keys: string[]; fixed?: boolean; shown?: string[] }) {
  if (fixed && shown) {
    return (
      <Box sx={{ display: "inline-flex", flexWrap: "wrap", gap: 0.5 }}>
        {shown.map((k) => (
          <Box key={k} component="span" role="img" aria-label={editorKeyName(k) ?? comboSpoken(k)}>
            <Keycap>{editorKeyLabel(k)}</Keycap>
          </Box>
        ))}
      </Box>
    );
  }
  if (!keys.length) {
    return <Typography component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Off</Typography>;
  }
  return (
    <Box sx={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && (
            <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              or
            </Typography>
          )}
          {fixed ? (
            <Box component="span" role="img" aria-label={comboSpoken(k)}>
              <Keycap>{editorKeyLabel(k)}</Keycap>
            </Box>
          ) : (
            <Combo combo={k} />
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}

// Change, Add key, Reset, on/off: fixed cells so every row's buttons line up
const ACTION_COLUMNS = "72px 76px 60px 44px";
const ACTIONS_WIDTH = 72 + 76 + 60 + 44 + 3 * 4;

const linkBtnSx = { minHeight: 32, minWidth: 0, px: 1, fontSize: "0.8125rem", fontWeight: 600, color: "text.primary", borderRadius: "8px" } as const;

interface RowProps {
  k: EditorKey;
  keys: string[];
  overridden: boolean;
  recording: "replace" | "add" | null;
  clashWith: string[];
  problem: string | null;
  onRecord: (mode: "replace" | "add") => void;
  onReset: () => void;
  onToggle: (on: boolean) => void;
}

function ShortcutRow({ k, keys, overridden, recording, clashWith, problem, onRecord, onReset, onToggle }: RowProps) {
  const rowId = `kb-${k.id.replace(/\./g, "-")}`;
  const message = problem ?? (clashWith.length ? `Also used by “${clashWith.join("”, “")}”. Give one of them another key.` : null);
  return (
    <Box
      component="li"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto" },
        alignItems: "center",
        columnGap: 2,
        rowGap: 1,
        py: 1.5,
        borderTop: "1px solid",
        borderColor: "divider",
        "&:first-of-type": { borderTop: "none" },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={`${rowId}-label`} sx={{ fontSize: "0.875rem", fontWeight: 500, color: keys.length || k.fixed ? "text.primary" : "text.secondary" }}>
          {k.label}
        </Typography>
        {k.fixed && (
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", display: "inline-flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
            <Lock size={12} aria-hidden /> Fixed
          </Typography>
        )}
        {message && (
          <Typography id={`${rowId}-msg`} role="alert" sx={{ fontSize: "0.75rem", color: "error.main", fontWeight: 600, mt: 0.5 }}>
            {message}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: { xs: "space-between", sm: "flex-end" }, flexWrap: "wrap", gap: 1, minWidth: 0 }}>
        {recording ? (
          <Box
            role="status"
            aria-live="assertive"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 32,
              px: 1.25,
              borderRadius: "8px",
              border: "1.5px dashed",
              borderColor: "text.primary",
              fontSize: "0.8125rem",
              fontWeight: 600,
              "@media (prefers-reduced-motion: no-preference)": { animation: "kbPulse 1.4s ease-in-out infinite" },
              "@keyframes kbPulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
            }}
          >
            Press keys… (Esc to cancel)
          </Box>
        ) : (
          <KeyList keys={keys} fixed={k.fixed} shown={k.show} />
        )}
        {k.fixed ? (
          // Keeps the fixed rows' keys in line with the others' (the actions column is empty here)
          <Box aria-hidden sx={{ display: { xs: "none", sm: "block" }, width: ACTIONS_WIDTH }} />
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: ACTION_COLUMNS, alignItems: "center", justifyItems: "start", columnGap: "4px", width: { sm: ACTIONS_WIDTH } }}>
            {keys.length > 0 ? (
              <Button id={`${rowId}-change`} size="small" onClick={() => onRecord("replace")} disabled={!!recording} aria-describedby={`${rowId}-label`} sx={linkBtnSx}>
                Change
              </Button>
            ) : (
              <Button id={`${rowId}-change`} size="small" onClick={() => onRecord("add")} disabled={!!recording} aria-describedby={`${rowId}-label`} sx={linkBtnSx}>
                Set key
              </Button>
            )}
            {keys.length > 0 && keys.length < MAX_COMBOS ? (
              <Button id={`${rowId}-add`} size="small" onClick={() => onRecord("add")} disabled={!!recording} aria-describedby={`${rowId}-label`} sx={linkBtnSx}>
                Add key
              </Button>
            ) : (
              <span />
            )}
            {overridden ? (
              <Button size="small" onClick={onReset} disabled={!!recording} aria-describedby={`${rowId}-label`} sx={{ ...linkBtnSx, color: "text.secondary" }}>
                Reset
              </Button>
            ) : (
              <span />
            )}
            <Switch
              size="small"
              checked={keys.length > 0}
              onChange={(e) => onToggle(e.target.checked)}
              disabled={!!recording}
              slotProps={{ input: { "aria-label": `${k.label}: shortcut ${keys.length ? "on" : "off"}` } }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function KeyboardShortcuts({ id, notify }: { id: string; notify: (text: string) => void }) {
  const { phase1 } = usePhase();
  const store = useKeyBindings();
  const groups = useMemo(() => profileKeyGroups(phase1), [phase1]);
  const all = useMemo(() => groups.flatMap((g) => g.keys), [groups]);

  const [draft, setDraft] = useState<KeyBindingMap>(store.overrides);
  const [synced, setSynced] = useState(store.version);
  const [recording, setRecording] = useState<{ id: string; mode: "replace" | "add" } | null>(null);
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !sameMap(cleanDraft(draft, all), cleanDraft(store.overrides, all));
  // Saved keys changed elsewhere (a /me refresh, another save): take them in unless there is an unsaved draft
  if (store.version !== synced) {
    setSynced(store.version);
    if (!dirty) setDraft(store.overrides);
  }

  // Clashes within an area: the queue's keys are off while the editor is open, so only same-area keys collide
  // Two actions clash when they share a combo and either both work in the same place (queue or editor), or both
  // would be saved: the server refuses any two saved actions with the same combo (key_clash), whatever the area
  const clashes = useMemo(() => {
    const out = new Map<string, string[]>();
    const saved = cleanDraft(draft, all);
    const users = new Map<string, { k: EditorKey; area: string }[]>();
    for (const g of groups) for (const k of g.keys) for (const c of draftKeys(k, draft)) users.set(c, [...(users.get(c) ?? []), { k, area: g.area }]);
    const isSaved = (k: EditorKey) => !k.fixed && Object.prototype.hasOwnProperty.call(saved, bindId(k));
    for (const list of users.values()) {
      for (const a of list) {
        const others = list.filter((b) => b.k !== a.k && (b.area === a.area || (isSaved(a.k) && isSaved(b.k)))).map((b) => b.k.label);
        if (others.length) out.set(a.k.id, [...new Set([...(out.get(a.k.id) ?? []), ...others])]);
      }
    }
    return out;
  }, [groups, all, draft]);
  const clashCount = clashes.size;

  const setKeys = (k: EditorKey, keys: string[] | null) => {
    setError(null);
    setDraft((d) => {
      const next = { ...d };
      if (keys === null) delete next[bindId(k)];
      else next[bindId(k)] = keys;
      return next;
    });
  };

  // ── Recording: the next key press (with its modifiers) becomes the shortcut ──
  useEffect(() => {
    if (!recording) return;
    const k = all.find((x) => x.id === recording.id);
    if (!k) return;
    const rowId = `kb-${k.id.replace(/\./g, "-")}`;
    const finish = () => {
      setRecording(null);
      // Back to the row's button, so the keyboard user carries on from where they were
      requestAnimationFrame(() => document.getElementById(`${rowId}-change`)?.focus());
    };
    const onKey = (e: KeyboardEvent) => {
      // Tab is never a shortcut: it stops recording and moves focus as usual
      if (e.key === "Tab") {
        setRecording(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || e.isComposing || MODIFIER_KEYS.has(e.key)) return;
      if (e.key === "Escape") {
        finish();
        return;
      }
      const combo = eventKey(e);
      const why = comboProblem(combo, k.global);
      if (why) {
        setProblem({ id: k.id, text: `${comboCaps(combo).join("+")} can't be used. ${why}` });
        finish();
        return;
      }
      setProblem(null);
      const current = draftKeys(k, draft);
      const keys = recording.mode === "replace" ? [combo] : [...current.filter((c) => c !== combo), combo].slice(0, MAX_COMBOS);
      setKeys(k, sameList(keys, k.keys) ? null : keys);
      finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const resetAll = () => {
    setProblem(null);
    setError(null);
    setDraft({});
  };
  const anyChanged = Object.keys(cleanDraft(draft, all)).length > 0;

  const save = async () => {
    if (clashCount || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await accessService.saveKeyBindings(cleanDraft(draft, all));
      const saved = sanitizeBindings(res.keyBindings);
      setKeyBindingOverrides(saved);
      setDraft(saved);
      notify("Shortcuts saved. The desk uses them now.");
    } catch (err) {
      setError(saveErrorText(err));
    }
    setSaving(false);
  };

  return (
    <SectionCard
      id={id}
      icon={<Keyboard size={18} />}
      title="Keyboard shortcuts"
      description="Your own keys for the desk and the post editor. They follow you to any browser you sign in on."
      action={
        <Button onClick={resetAll} disabled={!anyChanged || saving || !!recording} sx={{ minHeight: 36, px: 1.5, fontWeight: 600, color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: "10px" }}>
          Reset all
        </Button>
      }
    >
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5, py: 1 }}>
        Choose Change, then press the keys you want. Each action can have up to two. Esc, Tab and the browser&apos;s own keys stay as they are.
      </Typography>
      {groups.map((g, gi) => (
        <Box key={g.title} component="section" aria-labelledby={`kb-group-${gi}`} sx={{ mt: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography id={`kb-group-${gi}`} component="h3" sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
              {g.title}
            </Typography>
            <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {g.area === "queue" ? "On the desk's list of stories" : "In the post editor"}
            </Typography>
          </Box>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {g.keys.map((k) => (
              <ShortcutRow
                key={k.id}
                k={k}
                keys={draftKeys(k, draft)}
                overridden={!k.fixed && Object.prototype.hasOwnProperty.call(draft, bindId(k)) && !sameList(draft[bindId(k)], k.keys)}
                recording={recording?.id === k.id ? recording.mode : null}
                clashWith={clashes.get(k.id) ?? []}
                problem={problem?.id === k.id ? problem.text : null}
                onRecord={(mode) => {
                  setProblem(null);
                  setRecording({ id: k.id, mode });
                }}
                onReset={() => {
                  setProblem(null);
                  setKeys(k, null);
                }}
                onToggle={(on) => {
                  setProblem(null);
                  setKeys(k, on ? null : []);
                }}
              />
            ))}
          </Box>
        </Box>
      ))}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5, fontSize: "0.8125rem", borderRadius: "10px" }}>
          {error}
        </Alert>
      )}

      {dirty && (
        <Box
          sx={{
            position: "sticky",
            bottom: 12,
            mt: 2,
            mb: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
            px: 2,
            py: 1.25,
            borderRadius: "12px",
            border: "1px solid",
            borderColor: "divider",
            backgroundColor: "background.paper",
            boxShadow: "0 6px 24px rgba(16,24,40,0.12)",
            zIndex: 2,
          }}
        >
          <Typography role="status" sx={{ fontSize: "0.8125rem", fontWeight: 600, color: clashCount ? "error.main" : "text.primary" }}>
            {clashCount ? "Fix the clashing keys to save." : "You have unsaved shortcut changes."}
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              onClick={() => {
                setDraft(store.overrides);
                setProblem(null);
                setError(null);
              }}
              disabled={saving}
              sx={{ color: "text.primary" }}
            >
              Discard
            </Button>
            <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving || clashCount > 0} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Save shortcuts
            </Button>
          </Box>
        </Box>
      )}
    </SectionCard>
  );
}
