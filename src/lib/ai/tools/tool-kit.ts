import { createPieChartTool } from "./visualization/create-pie-chart";
import { createBarChartTool } from "./visualization/create-bar-chart";
import { createLineChartTool } from "./visualization/create-line-chart";
import { createTableTool } from "./visualization/create-table";
import { exaSearchTool, exaContentsTool } from "./web/web-search";
import { AppDefaultToolkit, DefaultToolName } from ".";
import { Tool } from "ai";
import { httpFetchTool } from "./http/fetch";
import { jsExecutionTool } from "./code/js-run-tool";
import { pythonExecutionTool } from "./code/python-run-tool";
import { createAgentTool } from "./agent/create-agent";
import { updateAgentTool } from "./agent/update-agent";
import { deleteAgentTool } from "./agent/delete-agent";
import { listAgentsTool } from "./agent/list-agents";
import { createWorkflowTool } from "./workflow/create-workflow";
import { updateWorkflowTool } from "./workflow/update-workflow";
import { deleteWorkflowTool } from "./workflow/delete-workflow";
import { listWorkflowsTool } from "./workflow/list-workflows";
import { addNodeTool } from "./workflow/add-node";
import { updateNodeTool } from "./workflow/update-node";
import { deleteNodeTool } from "./workflow/delete-node";
import { listNodesTool } from "./workflow/list-nodes";
import { addEdgeTool } from "./workflow/add-edge";
import { deleteEdgeTool } from "./workflow/delete-edge";
import { listEdgesTool } from "./workflow/list-edges";
import { getWorkflowStructureTool } from "./workflow/get-workflow-structure";
import { listAvailableToolsTool } from "./workflow/list-available-tools";
import { scheduleTaskTool } from "./schedule/schedule-task";
import { listScheduledTasksTool } from "./schedule/list-scheduled-tasks";

export const APP_DEFAULT_TOOL_KIT: Record<
  AppDefaultToolkit,
  Record<string, Tool>
> = {
  [AppDefaultToolkit.Visualization]: {
    [DefaultToolName.CreatePieChart]: createPieChartTool,
    [DefaultToolName.CreateBarChart]: createBarChartTool,
    [DefaultToolName.CreateLineChart]: createLineChartTool,
    [DefaultToolName.CreateTable]: createTableTool,
  },
  [AppDefaultToolkit.WebSearch]: {
    [DefaultToolName.WebSearch]: exaSearchTool,
    [DefaultToolName.WebContent]: exaContentsTool,
  },
  [AppDefaultToolkit.Http]: {
    [DefaultToolName.Http]: httpFetchTool,
  },
  [AppDefaultToolkit.Code]: {
    [DefaultToolName.JavascriptExecution]: jsExecutionTool,
    [DefaultToolName.PythonExecution]: pythonExecutionTool,
  },
  [AppDefaultToolkit.Agent]: {
    [DefaultToolName.CreateAgent]: createAgentTool,
    [DefaultToolName.UpdateAgent]: updateAgentTool,
    [DefaultToolName.DeleteAgent]: deleteAgentTool,
    [DefaultToolName.ListAgents]: listAgentsTool,
  },
  [AppDefaultToolkit.Workflow]: {
    [DefaultToolName.CreateWorkflow]: createWorkflowTool,
    [DefaultToolName.UpdateWorkflow]: updateWorkflowTool,
    [DefaultToolName.DeleteWorkflow]: deleteWorkflowTool,
    [DefaultToolName.ListWorkflows]: listWorkflowsTool,
    [DefaultToolName.AddNode]: addNodeTool,
    [DefaultToolName.UpdateNode]: updateNodeTool,
    [DefaultToolName.DeleteNode]: deleteNodeTool,
    [DefaultToolName.ListNodes]: listNodesTool,
    [DefaultToolName.AddEdge]: addEdgeTool,
    [DefaultToolName.DeleteEdge]: deleteEdgeTool,
    [DefaultToolName.ListEdges]: listEdgesTool,
    [DefaultToolName.GetWorkflowStructure]: getWorkflowStructureTool,
    [DefaultToolName.ListAvailableTools]: listAvailableToolsTool,
  },
  [AppDefaultToolkit.Schedule]: {
    [DefaultToolName.ScheduleTask]: scheduleTaskTool,
    [DefaultToolName.ListScheduledTasks]: listScheduledTasksTool,
  },
};

