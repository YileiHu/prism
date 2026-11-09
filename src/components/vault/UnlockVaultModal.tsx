import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import Input from "../Input";
import Modal from "../Modal";
import Spinner from "../Spinner";

interface Props {
  open: boolean;
  vaultName: string;
  onClose: () => void;
  onUnlock: (password: string) => Promise<void>;
}

export default function UnlockVaultModal({ open, vaultName, onClose, onUnlock }: Props) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError("");
    setBusy(false);
  }, [open]);

  const submit = async () => {
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      await onUnlock(password);
    } catch (e) {
      setError(String(e).includes("BAD_PASSWORD") ? t["private.wrongPassword"] : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["private.unlockTitle"]}
      icon={LockKeyhole}
      size="sm"
      initialFocusRef={inputRef}
    >
      <p className="text-body text-secondary mb-4">
        {t["private.unlockDesc"].replace("{name}", vaultName)}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block text-caption text-tertiary mb-1.5">{t["private.password"]}</label>
        <Input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(""); }}
          placeholder={t["private.passwordPlaceholder"]}
          className="w-full"
          disabled={busy}
          autoComplete="current-password"
        />
        {error && <p className="mt-2 text-caption text-danger">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t["private.cancel"]}
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy || !password}>
            {busy && <Spinner size={14} />}
            {busy ? t["private.unlocking"] : t["private.unlockAction"]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
