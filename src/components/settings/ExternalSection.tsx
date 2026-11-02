import { useEffect, useState } from "react";
import { ExternalLink, Monitor } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import { SectionHeader, SettingBlock, TextField } from "./controls";

interface Props {
  onSaved: () => void;
}

export default function ExternalSection({ onSaved }: Props) {
  const { t } = useT();
  const [browserPath, setBrowserPath] = useState("");

  useEffect(() => {
    void window.prism.getSetting("browser_path").then((bp) => { if (bp) setBrowserPath(bp); });
  }, []);

  const save = async (value: string) => {
    setBrowserPath(value);
    await window.prism.setSetting("browser_path", value);
    onSaved();
  };

  const chooseFile = async () => {
    const file = await window.prism.selectFile();
    if (file) await save(file);
  };

  return (
    <section>
      <SectionHeader title={t["settings.external"]} description={t["settings.externalDesc"]} />

      <SettingBlock label={t["settings.browserPath"]} description={t["settings.browserPathPlaceholder"]}>
        <div className="flex gap-2">
          <div className="flex-1">
            <TextField value={browserPath} onCommit={save} mono />
          </div>
          <Button variant="secondary" size="xs" onClick={chooseFile}>
            {t["settings.selectFile"]}
          </Button>
          <Button
            variant="info"
            size="xs"
            onClick={() => window.prism.openUrl("https://example.com")}
          >
            <ExternalLink size={12} />
            {t["settings.browserTest"]}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-caption text-muted">
          <Monitor size={12} />
          <span>{t["settings.browserPathHint"]}</span>
        </div>
      </SettingBlock>
    </section>
  );
}
