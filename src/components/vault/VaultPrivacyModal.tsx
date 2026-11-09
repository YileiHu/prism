import { useEffect, useRef, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck, ShieldOff } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import Input from "../Input";
import Modal from "../Modal";
import Spinner from "../Spinner";

export type VaultPrivacyMode = "makePrivate" | "changePassword" | "makePublic";

interface Props {
  open: boolean;
  mode: VaultPrivacyMode;
  vaultName: string;
  vaultPath: string;
  onClose: () => void;
  onDone: () => void;
}

const MIN_PASSWORD_LENGTH = 4;

export default function VaultPrivacyModal({
  open,
  mode,
  vaultName,
  vaultPath,
  onClose,
  onDone,
}: Props) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setCurrentPassword("");
    setBusy(false);
    setProgress(null);
    setError("");
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    return window.prism.onVaultMigrationProgress((update) => {
      if (update.vaultPath !== vaultPath) return;
      setProgress({ done: update.done, total: update.total });
    });
  }, [open, vaultPath]);

  const validateNewPassword = (): string => {
    if (password.length < MIN_PASSWORD_LENGTH) return t["private.passwordTooShort"];
    if (mode !== "changePassword" && password !== confirm) return t["private.passwordMismatch"];
    return "";
  };

  const submit = async () => {
    if (busy) return;
    if (mode === "makePublic") {
      setBusy(true);
      try {
        await window.prism.makeVaultPublic(vaultPath);
        onDone();
        onClose();
      } catch (e) {
        setError(`${t["private.makePublicFailed"]} (${String(e).includes("CRYPTO_INVALID") ? "CRYPTO_INVALID" : String(e)})`);
        setBusy(false);
      }
      return;
    }
    const invalid = validateNewPassword();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "makePrivate") {
        await window.prism.makeVaultPrivate(vaultPath, password);
      } else {
        await window.prism.changeVaultPassword(vaultPath, currentPassword, password);
      }
      onDone();
      onClose();
    } catch (e) {
      const raw = String(e);
      setError(raw.includes("BAD_PASSWORD")
        ? t["private.wrongPassword"]
        : `${mode === "makePrivate" ? t["private.makePrivateFailed"] : t["private.changePasswordFailed"]} (${raw})`);
      setBusy(false);
    }
  };

  const title = mode === "makePrivate"
    ? t["private.makePrivateTitle"]
    : mode === "changePassword"
      ? t["private.changePasswordTitle"]
      : t["private.makePublic"];
  const Icon = mode === "makePrivate" ? ShieldCheck : mode === "changePassword" ? KeyRound : ShieldOff;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={Icon}
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      initialFocusRef={mode === "makePublic" ? undefined : inputRef}
    >
      {mode === "makePrivate" && (
        <div className="mb-4 rounded-control border border-warning/40 bg-warning/10 px-3 py-2.5 text-caption text-secondary leading-relaxed">
          <p>{t["private.makePrivateDesc"].replace("{name}", vaultName)}</p>
          <p className="mt-1.5 text-warning">{t["private.makePrivateWarning"]}</p>
        </div>
      )}

      {mode === "makePublic" && (
        <p className="text-body text-secondary mb-4 leading-relaxed">
          {t["private.makePublicConfirm"].replace("{name}", vaultName)}
        </p>
      )}

      {mode === "changePassword" && (
        <>
          <label className="block text-caption text-tertiary mb-1.5">{t["private.currentPassword"]}</label>
          <Input
            ref={inputRef}
            type="password"
            value={currentPassword}
            onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }}
            className="w-full mb-3"
            disabled={busy}
            autoComplete="current-password"
          />
        </>
      )}

      {mode !== "makePublic" && (
        <>
          <label className="block text-caption text-tertiary mb-1.5">
            {mode === "changePassword" ? t["private.newPassword"] : t["private.password"]}
          </label>
          <Input
            ref={mode === "changePassword" ? undefined : inputRef}
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(""); }}
            placeholder={t["private.passwordPlaceholder"]}
            className="w-full"
            disabled={busy}
            autoComplete="new-password"
          />
          {mode === "makePrivate" && (
            <Input
              type="password"
              value={confirm}
              onChange={(event) => { setConfirm(event.target.value); setError(""); }}
              placeholder={t["private.passwordConfirm"]}
              className="w-full mt-3"
              disabled={busy}
              autoComplete="new-password"
            />
          )}
        </>
      )}

      {busy && progress && progress.total > 0 && (
        <p className="mt-3 text-caption text-tertiary">
          {(mode === "makePrivate" ? t["private.encrypting"] : t["private.decrypting"])
            .replace("{done}", String(progress.done))
            .replace("{total}", String(progress.total))}
        </p>
      )}
      {error && <p className="mt-3 text-caption text-danger break-words">{error}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {t["private.cancel"]}
        </Button>
        <Button
          variant={mode === "makePublic" ? "danger" : "primary"}
          size="sm"
          onClick={() => { void submit(); }}
          disabled={busy || (mode === "makePublic" ? false : !password)}
        >
          {busy ? <Spinner size={14} /> : mode === "makePublic" ? t["private.makePublic"] : t["private.done"]}
        </Button>
      </div>
    </Modal>
  );
}
