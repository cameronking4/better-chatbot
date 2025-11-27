"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "ui/alert-dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { PlusIcon, TrashIcon, CopyIcon, KeyIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeyWithFullKey extends ApiKey {
  fullKey: string;
}

export function UserApiKeysCard({ userId }: { userId: string }) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<ApiKeyWithFullKey | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ keys: ApiKey[] }>(
    "/api/user/api-keys",
    fetcher,
  );

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a key name");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create API key");
      }

      const result = await response.json();
      setNewKeyResult(result.key);
      setNewKeyName("");
      mutate("/api/user/api-keys");
      toast.success("API key created successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const response = await fetch(`/api/user/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke API key");
      }

      mutate("/api/user/api-keys");
      toast.success("API key revoked successfully");
      setKeyToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke API key",
      );
    }
  };

  const handleCopyKey = async (key: string, keyId: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKeyId(keyId);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const activeKeys =
    data?.keys.filter((key) => !key.revokedAt && !isExpired(key)) || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyIcon className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage your API keys for programmatic access to the chat API
              </CardDescription>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for programmatic access. The key will
                    only be shown once.
                  </DialogDescription>
                </DialogHeader>

                {!newKeyResult ? (
                  <>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="key-name">Key Name</Label>
                        <Input
                          id="key-name"
                          placeholder="Production API Key"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isCreating) {
                              handleCreateKey();
                            }
                          }}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleCreateKey}
                        disabled={isCreating}
                      >
                        {isCreating ? "Creating..." : "Create Key"}
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Your API Key</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={newKeyResult.fullKey}
                            className="font-mono text-sm"
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              handleCopyKey(
                                newKeyResult.fullKey,
                                newKeyResult.id,
                              )
                            }
                          >
                            {copiedKeyId === newKeyResult.id ? (
                              <CheckIcon className="h-4 w-4" />
                            ) : (
                              <CopyIcon className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-destructive">
                          ⚠️ Save this key now. You won't be able to see it
                          again!
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          setNewKeyResult(null);
                          setCreateDialogOpen(false);
                        }}
                      >
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : error ? (
            <div className="text-sm text-destructive">
              Failed to load API keys
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {activeKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{key.name}</div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {key.keyPrefix}...
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {key.lastUsedAt
                        ? `Last used: ${new Date(key.lastUsedAt).toLocaleDateString()}`
                        : "Never used"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setKeyToDelete(key)}
                    className="text-destructive hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!keyToDelete}
        onOpenChange={() => setKeyToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the API key "{keyToDelete?.name}".
              Any applications using this key will no longer be able to access
              the API. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => keyToDelete && handleDeleteKey(keyToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function isExpired(key: ApiKey): boolean {
  if (!key.expiresAt) return false;
  return new Date(key.expiresAt) < new Date();
}
