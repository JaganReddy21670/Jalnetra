export interface EmailTemplate {
  key: string;
  name: string;
  trigger: string;
  subject: string;
  body: string;
}

export const defaultTemplates: EmailTemplate[] = [
  {
    key: "reminder",
    name: "Daily Inspection Reminder",
    trigger: "At each reminder time, only to engineers with pending nodes",
    subject: "Reminder: {{pending_count}} inspection(s) due by {{deadline}} IST",
    body: `Hello {{engineer_name}},

This is a reminder that the following node(s) assigned to you have not been inspected today ({{date}}):

{{pending_nodes_table}}

Please complete the daily checklist before {{deadline}} IST.
Open checklist: {{checklist_link}}

— JalNetra Monitoring`,
  },
  {
    key: "pending",
    name: "5:00 PM Pending Inspection Alert",
    trigger: "At deadline, to engineers who still have pending nodes",
    subject: "Action required: {{pending_count}} inspection(s) missed the {{deadline}} deadline",
    body: `Hello {{engineer_name}},

The daily inspection deadline ({{deadline}} IST) has passed and the following node(s) remain unchecked:

{{pending_nodes_table}}

This has been escalated to your reporting authority. Please submit the pending checklists as soon as possible; they will be recorded as late.

— JalNetra Monitoring`,
  },
  {
    key: "escalation",
    name: "Management Escalation",
    trigger: "At deadline, to configured escalation recipients",
    subject: "Escalation: {{total_pending}} node(s) not inspected on {{date}}",
    body: `Dear Sir/Madam,

As of {{deadline}} IST on {{date}}, {{total_pending}} active node(s) have not been inspected.

{{escalation_table}}

Overall completion today: {{completion_pct}}%.
View live dashboard: {{dashboard_link}}

— JalNetra Monitoring (automated)`,
  },
  {
    key: "issue",
    name: "New Device Issue Report",
    trigger: "Immediately when an inspection is submitted with Issue Detected",
    subject: "[{{priority}}] New issue {{issue_id}} on {{node_id}} – {{category}}",
    body: `A new issue has been reported.

Issue ID: {{issue_id}}
Node: {{node_id}} ({{location}})
Reported by: {{engineer_name}} at {{reported_at}}
Category: {{category}} · Priority: {{priority}}

Description:
{{description}}

View issue: {{issue_link}}`,
  },
  {
    key: "resolution",
    name: "Issue Resolution Notification",
    trigger: "When an issue is marked Resolved",
    subject: "Resolved: {{issue_id}} on {{node_id}}",
    body: `Hello {{engineer_name}},

Issue {{issue_id}} on node {{node_id}} has been marked as resolved by {{resolved_by}}.

Resolution remarks:
{{resolution_remarks}}

Please verify during your next daily inspection.`,
  },
  {
    key: "summary",
    name: "Daily Inspection Summary",
    trigger: "Daily at summary time, to management",
    subject: "Daily inspection summary – {{date}} ({{completion_pct}}% complete)",
    body: `Daily summary for {{date}}

Active nodes: {{total_active}}
Checked – Healthy: {{healthy_count}}
Checked – Issue Detected: {{issue_count}}
Not checked: {{total_pending}}
Late submissions: {{late_count}}

Open issues: {{open_issues}} (Critical: {{critical_issues}})

Full report attached (PDF).`,
  },
];

export const sampleVars: Record<string, string> = {
  engineer_name: "Arjun Mehta",
  pending_count: "3",
  deadline: "5:00 PM",
  date: "26 Nov 2026",
  pending_nodes_table: "• WN-1002 – North Reservoir, Valve House\n• WN-1005 – Central Campus, Library\n• WN-1007 – North Reservoir, Sump 1",
  checklist_link: "https://fieldcheck.app/checklist",
  dashboard_link: "https://fieldcheck.app/",
  total_pending: "9",
  completion_pct: "78",
  escalation_table:
    "Engineer        | Email                         | Node    | Location          | Pending | Status\nArjun Mehta     | arjun.mehta@fieldops.example  | WN-1002 | North Reservoir   | 3       | Not Checked\nVikram Singh    | vikram.singh@fieldops.example | WN-1047 | South OH Tanks    | 4       | Not Checked",
  issue_id: "ISS-2501",
  node_id: "WN-1003",
  location: "North Reservoir",
  reported_at: "26 Nov 2026, 02:12 pm",
  category: "Sensor Fault",
  priority: "High",
  description: "Ultrasonic sensor returning constant 0.00 m reading since early morning.",
  issue_link: "https://fieldcheck.app/issues",
  resolved_by: "Ravi Kumar (Maint.)",
  resolution_remarks: "Sensor replaced and data flow verified for 2 hours.",
  total_active: "52",
  healthy_count: "36",
  issue_count: "5",
  late_count: "2",
  open_issues: "11",
  critical_issues: "2",
};

export function render(tpl: string, vars: Record<string, string> = sampleVars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
