"use client";

import { useTranslations } from "next-intl";
import { ClockIcon, Calendar, Repeat } from "lucide-react";
import { TextShimmer } from "ui/text-shimmer";

export function ScheduledTaskGreeting() {
  const t = useTranslations();

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("ScheduledTask.title")}</h2>
        <p className="text-muted-foreground">
          {t("ScheduledTask.createScheduledTaskDescription")}
        </p>
      </div>

      {/* Main content - Two column layout */}
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left: Explanation */}
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              <ClockIcon className="size-4 inline-block mr-2" />
              {t("ScheduledTask.greeting.automatedExecutionTitle")}
            </h3>
            <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
              {t("ScheduledTask.greeting.automatedExecutionDescription")}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              <Calendar className="size-4 inline-block mr-2" />
              {t("ScheduledTask.greeting.flexibleSchedulingTitle")}
            </h3>
            <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
              {t("ScheduledTask.greeting.flexibleSchedulingDescription")}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              <Repeat className="size-4 inline-block mr-2" />
              {t("ScheduledTask.greeting.recurringTasksTitle")}
            </h3>
            <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
              {t("ScheduledTask.greeting.recurringTasksDescription")}
            </p>
          </div>

          <div className="border border-blue-500 bg-blue-500/5 rounded-lg p-4">
            <h4 className="text-xs font-medium text-blue-500 mb-2">
              {t("ScheduledTask.greeting.exampleTitle")}
            </h4>
            <p className="text-xs text-blue-500/50 leading-relaxed">
              {t("ScheduledTask.greeting.exampleDescription")}
            </p>
          </div>
        </div>

        {/* Right: Schedule Types Grid */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">
            {t("ScheduledTask.greeting.scheduleTypesTitle")}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                key: "cron",
                icon: Calendar,
                label: "Cron Schedule",
                description: t("ScheduledTask.greeting.cronDescription"),
              },
              {
                key: "interval",
                icon: Repeat,
                label: "Interval",
                description: t("ScheduledTask.greeting.intervalDescription"),
              },
            ].map(({ key, icon: Icon, label, description }) => (
              <div
                key={key}
                className="group flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-accent transition-colors cursor-default"
              >
                <Icon className="ring-4 ring-input/40 group-hover:ring-input group-hover:scale-105 transition-all duration-300 size-8" />
                <span className="text-xs font-medium text-center group-hover:hidden block">
                  {label}
                </span>
                <TextShimmer className="text-xs font-medium text-center group-hover:block hidden">
                  {label}
                </TextShimmer>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  {description}
                </p>
              </div>
            ))}
          </div>

          {/* Invocation in chat via schedule tool */}
          <div className="mt-6 border border-muted rounded-lg p-4 bg-muted/40 flex flex-col items-center">
            <h4 className="text-xs font-semibold mb-1 text-foreground">
              Invocate in chat by using the{" "}
              <span className="font-mono px-1 bg-accent/40 rounded">
                schedule
              </span>{" "}
              tool
            </h4>
            <p className="text-xs text-muted-foreground text-center">
              You can trigger scheduling while chatting by selecting the{" "}
              <span className="font-mono px-1 bg-accent/40 rounded">
                schedule
              </span>{" "}
              tool from the chat toolbox.
            </p>
            <div className="flex items-center justify-between w-full bg-background rounded-md px-3 py-2 mt-4 border border-muted">
              <div className="flex items-center gap-2">
                {/* Replace with your key (tool) icon */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="text-foreground"
                  aria-hidden="true"
                >
                  <path
                    d="M17.32 2.38a2.87 2.87 0 0 0-4.05 0 2.87 2.87 0 0 0-.18 3.89l-9.65 9.65c-.22.22-.34.51-.34.82v2.16c0 .64.52 1.16 1.16 1.16h2.17c.31 0 .6-.12.81-.34l.93-.93c.17-.18.17-.46 0-.63a.44.44 0 0 0-.63 0l-.93.93a.19.19 0 0 1-.13.05H4.17a.19.19 0 0 1-.17-.17v-2.17c0-.05.02-.09.05-.13l9.65-9.65a2.87 2.87 0 0 0 3.89-.18 2.87 2.87 0 0 0 .01-4.05Zm-.63 3.43A1.87 1.87 0 1 1 16.85 2a1.87 1.87 0 0 1-.16 3.81Zm-5.22 1.99 1.25 1.25-8.9 8.9a.44.44 0 1 1-.63-.63l8.9-8.9Z"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm font-medium text-foreground">
                  schedule
                </span>
              </div>
              {/* Toggle switch mockup */}
              <div className="relative flex items-center">
                <div className="w-10 h-6 bg-muted rounded-full flex items-center transition-colors duration-200">
                  <div className="w-5 h-5 bg-background border border-muted-foreground rounded-full translate-x-1 shadow transition-transform duration-200" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          {t("ScheduledTask.greeting.ctaMessage")}
        </p>
      </div>
    </div>
  );
}
