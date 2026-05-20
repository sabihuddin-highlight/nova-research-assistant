export type AgentName = "Clarity" | "Research" | "Validator" | "Synthesis";

export interface AgentEvent {
  agent: AgentName | string;
  summary: string;
  detail: Record<string, unknown>;
}

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatResponse {
  status: "complete" | "needs_clarification";
  thread_id: string;
  answer?: string | null;
  clarification_question?: string | null;
  agent_trail: AgentEvent[];
  sources: Source[];
  confidence_score?: number | null;
  research_attempts?: number | null;
  validation_result?: string | null;
  company_focus?: string | null;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentTrail?: AgentEvent[];
  sources?: Source[];
  confidenceScore?: number | null;
  researchAttempts?: number | null;
  validationResult?: string | null;
  companyFocus?: string | null;
}

/** A persisted conversation as shown in the left sidebar. */
export interface Conversation {
  id: string;
  title: string;
  companyFocus?: string | null;
  createdAt: number;
  updatedAt: number;
}
