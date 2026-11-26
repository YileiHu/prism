import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import SelectButton from "../SelectButton";
import DateField from "../DateField";
import GrowthArtifactGalleryField from "./GrowthArtifactGalleryField";
import useGrowthImagesDraft from "./useGrowthImagesDraft";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey, localDateFromStamp } from "../../lib/dates";
import { capabilityGroupsByDomain } from "../../lib/capabilityGroups";
import type {
  GrowthArtifact,
  GrowthArtifactKind,
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
} from "../../shared/models";
import type { GrowthArtifactDefaults } from "./types";
import { ARTIFACT_KIND_KEYS } from "./labels";

interface Props {
  open: boolean;
  /** null = create */
  artifact: GrowthArtifact | null;
  defaults: GrowthArtifactDefaults;
  capabilities: GrowthCapability[];
  domains: GrowthDomain[];
  challenges: GrowthChallenge[];
  onClose: () => void;
  onSaved: (artifact: GrowthArtifact) => void;
}

const ARTIFACT_KINDS: GrowthArtifactKind[] = ["demo", "article", "repo", "doc", "other"];

export default function GrowthArtifactModal({
  open,
  artifact,
  defaults,
  capabilities,
  domains,
  challenges,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GrowthArtifactKind>("demo");
  const [createdOn, setCreatedOn] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [cover, setCover] = useState("");
  const [busy, setBusy] = useState(false);
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const twoColumn = width >= 880;
  const initialImages = artifact
    ? artifact.images.length > 0
      ? artifact.images
      : [artifact.cover].filter((name) => name !== "")
    : [];
  const { images, add, remove, commitAfterSave, discardOnCancel, max } = useGrowthImagesDraft({
    open,
    initialImages,
    pickTitle: t["growth.artifactCoverDialogTitle"],
  });

  useEffect(() => {
    if (!open) return;
    setTitle(artifact?.title ?? "");
    setKind(artifact?.kind ?? "demo");
    setCreatedOn(
      artifact?.createdOn ??
        defaults.createdOn ??
        (artifact ? localDateFromStamp(artifact.createdAt) : dateKey(new Date())),
    );
    setCapabilityId(
      artifact?.capabilityId
        ? String(artifact.capabilityId)
        : defaults.capabilityId
          ? String(defaults.capabilityId)
          : "",
    );
    setChallengeId(
      artifact?.challengeId
        ? String(artifact.challengeId)
        : defaults.challengeId
          ? String(defaults.challengeId)
          : "",
    );
    setNote(artifact?.note ?? "");
    setBody(artifact?.body ?? "");
    setUrl(artifact?.url ?? "");
    setCover(artifact?.cover || (artifact?.images?.[0] ?? ""));
  }, [open, artifact, defaults]);

  const capabilityGroups = useMemo(
    () => capabilityGroupsByDomain(capabilities, domains),
    [capabilities, domains],
  );
  const kindOptions = useMemo(
    () => ARTIFACT_KINDS.map((value) => ({ value, label: t[ARTIFACT_KIND_KEYS[value]] })),
    [t],
  );
  const challengeOptions = useMemo(
    () => [
      { value: "", label: t["growth.challengeNone"] },
      ...challenges.map((challenge) => ({
        value: String(challenge.id),
        label: challenge.seasonTitle
          ? `${challenge.seasonTitle} · ${challenge.title}`
          : challenge.title,
      })),
    ],
    [challenges, t],
  );

  const changeChallenge = (value: string) => {
    setChallengeId(value);
    const selected = challenges.find((challenge) => String(challenge.id) === value);
    // A work that comes from a challenge almost always proves that same
    // capability; the select stays editable afterwards.
    if (selected?.capabilityId) setCapabilityId(String(selected.capabilityId));
  };

  const close = () => {
    discardOnCancel();
    onClose();
  };

  const addImage = async () => {
    const name = await add();
    if (name && !cover) setCover(name);
  };

  const removeImage = (name: string) => {
    remove(name);
    if (cover === name) {
      const next = images.find((item) => item !== name) ?? "";
      setCover(next);
    }
  };

  const setCoverImage = (name: string) => {
    setCover(name);
  };

  const save = async () => {
    if (busy) return;
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const payload = {
        capabilityId: capabilityId === "" ? null : Number(capabilityId),
        challengeId: challengeId === "" ? null : Number(challengeId),
        title: clean,
        kind,
        url,
        note,
        body,
        cover: cover || images[0] || "",
        images,
        createdOn: createdOn === "" ? null : createdOn,
      };
      const saved = artifact
        ? await window.prism.updateGrowthArtifact(artifact.id, payload)
        : await window.prism.createGrowthArtifact(payload);
      // The row now points at this gallery: drop every replaced file.
      commitAfterSave(images);
      onSaved(saved);
      onClose();
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const metaFields = (
    <>
      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactTitle"]}</span>
        <Input
          className="w-full"
          autoFocus
          value={title}
          placeholder={t["growth.artifactTitlePlaceholder"]}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactKind"]}</span>
        <SelectButton
          value={kind}
          options={kindOptions}
          onChange={(value) => setKind(value as GrowthArtifactKind)}
          className="w-full"
        />
      </div>
      <label className="block min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactDate"]}</span>
        <DateField className="w-full" value={createdOn} onChange={setCreatedOn} />
      </label>
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeCapability"]}</span>
        <SelectButton
          value={capabilityId}
          groups={capabilityGroups}
          emptyLabel={t["growth.challengeNone"]}
          onChange={setCapabilityId}
          className="w-full"
        />
      </div>
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactChallenge"]}</span>
        <SelectButton
          value={challengeId}
          options={challengeOptions}
          onChange={changeChallenge}
          className="w-full"
        />
      </div>
      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactUrl"]}</span>
        <Input
          className="w-full"
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
    </>
  );

  const writingFields = (
    <>
      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactIntro"]}</span>
        <Textarea
          className="w-full"
          rows={3}
          value={note}
          placeholder={t["growth.artifactIntroPlaceholder"]}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <label className="flex min-h-0 flex-1 flex-col space-y-1">
        <span className="block text-caption text-muted">{t["growth.artifactBody"]}</span>
        <Textarea
          className="w-full min-h-[34vh] flex-1"
          rows={10}
          value={body}
          placeholder={t["growth.artifactBodyPlaceholder"]}
          onChange={(event) => setBody(event.target.value)}
        />
        <p className="text-caption text-faint">{t["growth.markdownHint"]}</p>
      </label>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={artifact ? t["growth.editArtifact"] : t["growth.newArtifact"]}
      layout="document"
      position="center"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy || !title.trim()} onClick={() => void save()}>
            {artifact ? t["growth.save"] : t["growth.create"]}
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${twoColumn ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        <div className="flex-shrink-0">
          <GrowthArtifactGalleryField
            images={images}
            cover={cover}
            max={max}
            onAdd={() => void addImage()}
            onRemove={removeImage}
            onSetCover={setCoverImage}
          />
        </div>
        {twoColumn ? (
          <div className="mt-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {metaFields}
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {writingFields}
            </div>
          </div>
        ) : (
          <div className="mt-4 w-full space-y-4">
            {metaFields}
            {writingFields}
          </div>
        )}
      </div>
    </Modal>
  );
}
