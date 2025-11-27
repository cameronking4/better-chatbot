"use client";

import { useEffect } from "react";
import { AutoHeight } from "ui/auto-height";

import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerPortal,
  DrawerTitle,
} from "ui/drawer";
import { ApiKeysContent } from "./api-keys-content";
import { X } from "lucide-react";
import { Button } from "ui/button";
import { useTranslations } from "next-intl";

export function ApiKeysPopup() {
  const [openApiKeysPopup, appStoreMutate] = appStore(
    useShallow((state) => [state.openApiKeysPopup, state.mutate]),
  );

  const t = useTranslations();

  const handleClose = () => {
    appStoreMutate({ openApiKeysPopup: false });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC key to close
      if (e.key === "Escape" && openApiKeysPopup) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openApiKeysPopup]);

  return (
    <Drawer
      handleOnly
      open={openApiKeysPopup}
      direction="top"
      onOpenChange={(open) => appStoreMutate({ openApiKeysPopup: open })}
    >
      <DrawerPortal>
        <DrawerContent
          style={{
            userSelect: "text",
          }}
          className="max-h-[100vh]! w-full h-full border-none rounded-none flex flex-col bg-card overflow-hidden p-4 md:p-6"
        >
          <div className="flex items-center justify-end">
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X />
            </Button>
          </div>
          <DrawerTitle className="sr-only">{t("ApiKeys.title")}</DrawerTitle>
          <DrawerDescription className="sr-only" />

          <div className="flex justify-center">
            <div className="w-full mt-4 lg:w-5xl lg:mt-14">
              <div className="flex flex-1 overflow-hidden">
                <AutoHeight className="flex-1 rounded-lg border">
                  <div className="p-4 md:p-8">
                    {openApiKeysPopup && <ApiKeysContent />}
                  </div>
                </AutoHeight>
              </div>
            </div>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}
