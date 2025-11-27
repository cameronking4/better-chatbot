"use client";

import { useState } from "react";
import { fetcher } from "lib/utils";
import {
  Copy,
  Loader,
  Trash2,
  Edit,
  RotateCw,
  Plus,
  Key,
  Check,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import {
  ApiKey,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from "@/types/api-key";
import { useCopy } from "@/hooks/use-copy";
import { notify } from "lib/notify";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";

export function ApiKeysContent() {
  const t = useTranslations();

  const {
    data: apiKeys,
    mutate: refetchKeys,
    isLoading,
  } = useSWR<ApiKey[]>("/api/api-keys", fetcher, {
    fallbackData: [],
  });

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [newKeyDialog, setNewKeyDialog] = useState<{
    open: boolean;
    key: string | null;
  }>({ open: false, key: null });

  const handleCreate = async (data: CreateApiKeyRequest) => {
    try {
      setCreating(true);
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create API key");
      }

      const result = await response.json();
      // Automatically copy to clipboard
      try {
        await navigator.clipboard.writeText(result.key);
      } catch (err) {
        // Fallback if clipboard API fails
        console.warn("Failed to copy to clipboard:", err);
      }
      setNewKeyDialog({ open: true, key: result.key });
      toast.success(t("ApiKeys.keyCreated"), {
        description: t("ApiKeys.keyCopiedToClipboard"),
      });
      refetchKeys();
    } catch (error: any) {
      toast.error(error.message || t("ApiKeys.failedToCreate"));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string, data: UpdateApiKeyRequest) => {
    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update API key");
      }

      toast.success(t("ApiKeys.updated"));
      refetchKeys();
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.message || t("ApiKeys.failedToUpdate"));
    }
  };

  const handleDelete = async (id: string) => {
    const answer = await notify.confirm({
      description: t("ApiKeys.confirmDelete"),
    });
    if (!answer) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete API key");
      }

      toast.success(t("ApiKeys.deleted"));
      refetchKeys();
    } catch (_error) {
      toast.error(t("ApiKeys.failedToDelete"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleRotate = async (id: string) => {
    const answer = await notify.confirm({
      description: t("ApiKeys.confirmRotate"),
    });
    if (!answer) {
      return;
    }

    try {
      setRotatingId(id);
      const response = await fetch(`/api/api-keys/${id}/rotate`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to rotate API key");
      }

      const result = await response.json();
      // Automatically copy to clipboard
      try {
        await navigator.clipboard.writeText(result.key);
      } catch (err) {
        // Fallback if clipboard API fails
        console.warn("Failed to copy to clipboard:", err);
      }
      setNewKeyDialog({ open: true, key: result.key });
      toast.success(t("ApiKeys.rotated"), {
        description: t("ApiKeys.keyCopiedToClipboard"),
      });
      refetchKeys();
    } catch (error: any) {
      toast.error(error.message || t("ApiKeys.failedToRotate"));
    } finally {
      setRotatingId(null);
    }
  };

  return (
    <div className="flex flex-col grow">
      <h3 className="text-xl font-semibold">{t("ApiKeys.title")}</h3>
      <p className="text-sm text-muted-foreground py-2">
        {t("ApiKeys.description")}
      </p>

      <div className="flex flex-col gap-4 w-full grow">
        <div className="flex justify-end">
          <CreateApiKeyForm onCreate={handleCreate} creating={creating} t={t} />
        </div>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))
        ) : !apiKeys || apiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t("ApiKeys.noKeysYet")}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("ApiKeys.createKeyHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((apiKey) => (
              <ApiKeyCard
                key={apiKey.id}
                apiKey={apiKey}
                editing={editingId === apiKey.id}
                deleting={deletingId === apiKey.id}
                rotating={rotatingId === apiKey.id}
                onEdit={() => setEditingId(apiKey.id)}
                onCancelEdit={() => setEditingId(null)}
                onUpdate={(data) => handleUpdate(apiKey.id, data)}
                onDelete={() => handleDelete(apiKey.id)}
                onRotate={() => handleRotate(apiKey.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <NewKeyDialog
        open={newKeyDialog.open}
        key={newKeyDialog.key}
        onClose={() => setNewKeyDialog({ open: false, key: null })}
        t={t}
      />
    </div>
  );
}

function CreateApiKeyForm({
  onCreate,
  creating,
  t,
}: {
  onCreate: (data: CreateApiKeyRequest) => void;
  creating: boolean;
  t: any;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [rateLimit, setRateLimit] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("ApiKeys.nameRequired"));
      return;
    }

    onCreate({
      name: name.trim(),
      expiresAt: expiresAt || null,
      rateLimit: rateLimit ? parseInt(rateLimit, 10) : null,
    });

    setName("");
    setExpiresAt("");
    setRateLimit("");
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-2" />
        {t("ApiKeys.createKey")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ApiKeys.createKey")}</DialogTitle>
            <DialogDescription>
              {t("ApiKeys.createKeyDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">{t("ApiKeys.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ApiKeys.namePlaceholder")}
                required
              />
            </div>
            <div>
              <Label htmlFor="expiresAt">{t("ApiKeys.expirationDate")}</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("ApiKeys.expirationDateHint")}
              </p>
            </div>
            <div>
              <Label htmlFor="rateLimit">{t("ApiKeys.rateLimit")}</Label>
              <Input
                id="rateLimit"
                type="number"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                placeholder={t("ApiKeys.rateLimitPlaceholder")}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("ApiKeys.rateLimitHint")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                {t("Common.cancel")}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader className="size-4 mr-2 animate-spin" />}
                {t("Common.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApiKeyCard({
  apiKey,
  editing,
  deleting,
  rotating,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onRotate,
  t,
}: {
  apiKey: ApiKey;
  editing: boolean;
  deleting: boolean;
  rotating: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (data: UpdateApiKeyRequest) => void;
  onDelete: () => void;
  onRotate: () => void;
  t: any;
}) {
  const [name, setName] = useState(apiKey.name);
  const [expiresAt, setExpiresAt] = useState(
    apiKey.expiresAt
      ? new Date(apiKey.expiresAt).toISOString().slice(0, 16)
      : "",
  );
  const [rateLimit, setRateLimit] = useState(
    apiKey.rateLimit?.toString() || "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      name: name.trim(),
      expiresAt: expiresAt || null,
      rateLimit: rateLimit ? parseInt(rateLimit, 10) : null,
    });
  };

  if (editing) {
    return (
      <div className="border rounded-lg p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor={`name-${apiKey.id}`}>{t("ApiKeys.name")}</Label>
            <Input
              id={`name-${apiKey.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`expiresAt-${apiKey.id}`}>
              {t("ApiKeys.expirationDate")}
            </Label>
            <Input
              id={`expiresAt-${apiKey.id}`}
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`rateLimit-${apiKey.id}`}>
              {t("ApiKeys.rateLimit")}
            </Label>
            <Input
              id={`rateLimit-${apiKey.id}`}
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancelEdit}>
              {t("Common.cancel")}
            </Button>
            <Button type="submit">{t("Common.save")}</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{apiKey.name}</h4>
            {!apiKey.isActive && (
              <span className="text-xs text-muted-foreground">
                ({t("ApiKeys.revoked")})
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{apiKey.keyPrefix}...</span>
            <span className="hidden sm:inline">•</span>
            <span>
              {t("ApiKeys.createdLabel")}{" "}
              {formatDistanceToNow(new Date(apiKey.createdAt), {
                addSuffix: true,
              })}
            </span>
            {apiKey.lastUsedAt && (
              <>
                <span className="hidden sm:inline">•</span>
                <span>
                  {t("ApiKeys.lastUsed")}{" "}
                  {formatDistanceToNow(new Date(apiKey.lastUsedAt), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
            {apiKey.requestCount > 0 && (
              <>
                <span className="hidden sm:inline">•</span>
                <span>
                  {apiKey.requestCount} {t("ApiKeys.requests")}
                </span>
              </>
            )}
            {apiKey.expiresAt && (
              <>
                <span className="hidden sm:inline">•</span>
                <span>
                  {t("ApiKeys.expires")}{" "}
                  {formatDistanceToNow(new Date(apiKey.expiresAt), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
            {apiKey.rateLimit && (
              <>
                <span className="hidden sm:inline">•</span>
                <span>
                  {t("ApiKeys.rateLimit")}: {apiKey.rateLimit}/min
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            title={t("Common.edit")}
          >
            <Edit className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRotate}
            disabled={rotating || !apiKey.isActive}
            title={t("ApiKeys.rotate")}
          >
            {rotating ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            title={t("Common.delete")}
          >
            {deleting ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4 hover:text-destructive" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewKeyDialog({
  open,
  key,
  onClose,
  t,
}: {
  open: boolean;
  key: string | null;
  onClose: () => void;
  t: any;
}) {
  const { copied, copy } = useCopy();

  if (!key) return null;

  const handleCopy = () => {
    copy(key);
    toast.success(t("ApiKeys.copied"));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            {t("ApiKeys.newKeyCreated")}
          </DialogTitle>
          <DialogDescription>
            {t("ApiKeys.newKeyDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-sm font-medium">
                {t("ApiKeys.yourApiKey")}
              </Label>
              {copied && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="size-3" />
                  {t("ApiKeys.copied")}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                value={key}
                readOnly
                className="font-mono text-sm pr-12 bg-muted"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={handleCopy}
                title={t("ApiKeys.copyKey")}
              >
                {copied ? (
                  <Check className="size-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200 font-medium mb-1">
              {t("ApiKeys.important")}
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t("ApiKeys.newKeyWarning")}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("Common.continue")}
            </Button>
            <Button onClick={handleCopy}>
              <Copy className="size-4 mr-2" />
              {copied ? t("ApiKeys.copied") : t("ApiKeys.copyKey")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
