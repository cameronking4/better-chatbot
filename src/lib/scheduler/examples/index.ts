import { CreateScheduledTaskInput } from "@/types/scheduled-task";

export const DailyDigest = (): CreateScheduledTaskInput => {
  return {
    name: "Daily News Digest",
    description:
      "Get a daily summary of the latest news and updates on topics you care about",
    prompt:
      "Create a daily news digest summarizing the top 5 most important stories from the past 24 hours. Focus on technology, business, and science news. Format the summary with clear headings and bullet points.",
    schedule: {
      type: "cron",
      expression: "0 9 * * *", // 9 AM daily
    },
    enabled: true,
  };
};

export const WeeklyReport = (): CreateScheduledTaskInput => {
  return {
    name: "Weekly Analytics Report",
    description:
      "Generate a comprehensive weekly report analyzing key metrics and trends",
    prompt:
      "Analyze the key metrics from this week and create a comprehensive weekly report. Include: 1) Summary of achievements, 2) Key metrics and trends, 3) Areas for improvement, 4) Recommendations for next week. Format as a structured markdown report.",
    schedule: {
      type: "interval",
      value: 1,
      unit: "weeks",
    },
    enabled: true,
  };
};
