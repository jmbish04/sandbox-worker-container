import type { DurableObjectStub } from '../types';

export type TravelIntentType =
  | 'weather'
  | 'destination'
  | 'booking'
  | 'attractions'
  | 'meta';

export interface AgentContext {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  locale?: string;
  [key: string]: unknown;
}

export interface TravelIntentBase {
  id: string;
  type: TravelIntentType;
  originalQuery: string;
  slots?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WeatherIntent extends TravelIntentBase {
  type: 'weather';
  destination: string;
  dates: Array<string>;
}

export interface DestinationIntent extends TravelIntentBase {
  type: 'destination';
  query: string;
  preferences?: Record<string, unknown>;
  budget?: number;
}

export type BookingType = 'flight' | 'hotel' | 'package';

export interface BookingIntent extends TravelIntentBase {
  type: 'booking';
  bookingType: BookingType;
  criteria: Record<string, unknown>;
  userPreferences?: Record<string, unknown>;
}

export interface AttractionsIntent extends TravelIntentBase {
  type: 'attractions';
  destination: string;
  interests?: Array<string>;
  dates?: Array<string>;
}

export type TravelIntent =
  | WeatherIntent
  | DestinationIntent
  | BookingIntent
  | AttractionsIntent
  | TravelIntentBase;

export interface AgentResponse<T = unknown> {
  type: string;
  content: T;
  confidence?: number;
  sources?: Array<string>;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  issues?: Array<string>;
  confidence?: number;
}

export interface ConversationTurn {
  id: string;
  timestamp: number;
  userMessage: string;
  agentResponse?: AgentResponse;
  intent?: TravelIntent;
  confidence?: number;
}

export interface AgentMetadata {
  agentType: TravelIntentType | string;
  version?: string;
  [key: string]: unknown;
}

export interface AgentState {
  agentId: string;
  sessionId: string;
  userId?: string;
  conversationHistory: Array<ConversationTurn>;
  extractedSlots: Record<string, unknown>;
  preferences: Record<string, unknown>;
  currentIntent?: TravelIntent;
  context?: Record<string, unknown>;
  metadata?: AgentMetadata;
  lastUpdated?: number;
}

export interface AgentMessage<T = unknown> {
  id?: string;
  type: string;
  content: T;
  context?: AgentContext;
  metadata?: Record<string, unknown>;
}

export interface AgentToolContext extends AgentContext {
  toolName?: string;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly supportedAgents: Array<string>;
  execute(params: TInput, context: AgentToolContext): Promise<TOutput>;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  toolCall: ToolCall;
  success: boolean;
  data: unknown;
  error?: unknown;
}

export interface RoutingDecision {
  primaryAgent: string;
  confidence: number;
  additionalAgents: Array<string>;
}

export interface AgentExecutionContext extends AgentContext {
  tools?: Array<string>;
  stubs?: Record<string, DurableObjectStub>;
}
