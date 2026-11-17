import { useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GtdProject } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (project: GtdProject) => void;
}

export default function GtdProjectCreateModal({ open, onClose, onCreated }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) setTitle("");
  }, [open]);

  const submit = async () => {
    const clean = title.trim();
    if (!clean) return;
    try {
      const project = await window.prism.addGtdProject(clean);
      onCreated(project);
      onClose();
    } catch {
      showToast(t["common.saveFailed"], "error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["gtd.newProject"]}
      icon={FolderPlus}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={!title.trim()} onClick={submit}>
            {t["gtd.createProject"]}
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-caption text-muted">{t["gtd.projectName"]}</label>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={t["gtd.projectNamePlaceholder"]}
        autoFocus
        className="w-full"
      />
    </Modal>
  );
}
