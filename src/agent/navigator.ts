/**
 * Care Navigator Agent — core reasoning (the "logIQ").
 *
 * PRD Features 1, 2, 3, 5. This is a deterministic, rule-based navigator that
 * runs with zero external API dependencies. It:
 *   1. Detects crisis/distress language -> immediate escalation (Feature 5).
 *   2. Detects out-of-scope clinical red flags -> clinical escalation (Feature 2).
 *   3. Routes specialist needs to the right agent (Feature 3).
 *   4. Answers FM questions from the knowledge base (Feature 2).
 *   5. Extracts zero-party data tags from each turn.
 *
 * The interface is intentionally shaped so a real LLM (Anthropic Claude per the
 * PRD tech stack) can be dropped in behind `generateReply` later without
 * changing callers.
 */

import {
  FM_KNOWLEDGE_BASE,
  CRISIS_PATTERNS,
  CRISIS_RESOURCES,
  OUT_OF_SCOPE_PATTERNS,
  KbEntry,
} from './knowledgeBase';
import { decideRoute, RouteDecision } from './routing';

export interface PatientContext {
  id: string;
  name: string;
  diagnosis: string[];
  careGoals?: string | null;
  lastInteractionAt?: string | null;
}

export interface AgentResult {
  reply: string;
  /** Specialist the session was routed to, if any. */
  route: RouteDecision;
  /** Whether a human escalation should be created. */
  escalate: boolean;
  urgency: 'normal' | 'urgent' | 'crisis';
  identifiedNeed: string;
  recommendedAction: string;
  /** Zero-party structured data extracted from this turn (Feature: data layer). */
  dataTags: Record<string, unknown>;
  agentId: string;
}

const GREETING_PATTERN = /\b(hi|hello|hey|good (morning|afternoon|evening))\b/i;

function retrieve(message: string): KbEntry | null {
  const lower = message.toLowerCase();
  let best: { entry: KbEntry; score: number } | null = null;
  for (const entry of FM_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) score += kw.split(' ').length;
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

function extractDataTags(message: string): Record<string, unknown> {
  const tags: Record<string, unknown> = {};
  const lower = message.toLowerCase();

  // crude symptom/severity capture for the zero-party flywheel
  const painMatch = lower.match(/pain (?:is |at |level )?(\d{1,2})(?:\s*\/\s*10)?/);
  if (painMatch) tags.reportedPainLevel = Number(painMatch[1]);

  const symptoms = ['fatigue', 'sleep', 'fog', 'headache', 'flare', 'anxiety', 'depression', 'stiffness']
    .filter((s) => lower.includes(s));
  if (symptoms.length) tags.mentionedSymptoms = symptoms;

  if (/\b(medication|duloxetine|pregabalin|milnacipran|lyrica|cymbalta)\b/i.test(message)) {
    tags.mentionedMedication = true;
  }
  return tags;
}

function greetingLine(ctx: PatientContext): string {
  const first = ctx.name?.split(' ')[0] || 'there';
  if (ctx.lastInteractionAt) {
    return `Welcome back, ${first}. Good to see you again.`;
  }
  return `Hi ${first}, I'm your Care Navigator.`;
}

export function runNavigator(message: string, ctx: PatientContext): AgentResult {
  const dataTags = extractDataTags(message);
  const baseAgentId = 'care-navigator';

  // 1. CRISIS — highest priority, immediate escalation, no routing delay.
  if (CRISIS_PATTERNS.some((p) => p.test(message))) {
    return {
      reply:
        `I'm really glad you told me, and I want to make sure you get support right now. ${CRISIS_RESOURCES}`,
      route: {
        needType: 'crisis / distress',
        routedTo: 'Human HNaaS Specialist',
        reason: 'Crisis language detected.',
        confidence: 0.99,
      },
      escalate: true,
      urgency: 'crisis',
      identifiedNeed: 'Crisis / distress — immediate human support',
      recommendedAction: 'Immediate outreach by clinical team; crisis resources surfaced in-chat.',
      dataTags: { ...dataTags, crisisDetected: true },
      agentId: baseAgentId,
    };
  }

  // 2. OUT-OF-SCOPE CLINICAL RED FLAGS — escalate to clinical, do not educate.
  for (const { pattern, label } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        reply:
          `What you're describing (${label}) is outside what I can safely help with, and it may need prompt medical attention. ` +
          `If this is an emergency, call 911. I'm flagging this to our clinical team right now so a person can follow up with you.`,
        route: {
          needType: 'out-of-scope clinical',
          routedTo: 'Human HNaaS Specialist',
          reason: `Out-of-scope clinical red flag: ${label}.`,
          confidence: 0.95,
        },
        escalate: true,
        urgency: 'urgent',
        identifiedNeed: `Out-of-scope clinical concern (${label})`,
        recommendedAction: 'Clinical triage by licensed provider; advise emergency care if acute.',
        dataTags: { ...dataTags, outOfScope: label },
        agentId: baseAgentId,
      };
    }
  }

  // 3. EXPLICIT HUMAN REQUEST
  if (/\b(talk to (a )?(human|person|someone)|real person|speak to (a )?nurse|human specialist)\b/i.test(message)) {
    return {
      reply:
        `Of course — I'm connecting you with a member of our HNaaS care team. ` +
        `I've packaged up your profile and our conversation so you won't have to repeat anything.`,
      route: {
        needType: 'human requested',
        routedTo: 'Human HNaaS Specialist',
        reason: 'Patient explicitly requested a human.',
        confidence: 0.97,
      },
      escalate: true,
      urgency: 'normal',
      identifiedNeed: 'Patient requested human support',
      recommendedAction: 'Warm handoff to HNaaS specialist with full context packet.',
      dataTags,
      agentId: baseAgentId,
    };
  }

  // 4. SPECIALIST ROUTING
  const route = decideRoute(message);
  if (route.routedTo && route.routedTo !== 'Human HNaaS Specialist') {
    return {
      reply:
        `It sounds like this is about ${route.needType}. I'm handing you to our ` +
        `${route.routedTo}, and I'm passing along everything we've discussed so you won't need to repeat yourself.`,
      route,
      escalate: false,
      urgency: 'normal',
      identifiedNeed: route.needType,
      recommendedAction: `Engage ${route.routedTo} with full session context.`,
      dataTags,
      agentId: baseAgentId,
    };
  }
  if (route.routedTo === 'Human HNaaS Specialist') {
    return {
      reply:
        `There's a lot going on here, and I think you'll be best served by one of our HNaaS specialists ` +
        `who can look at the whole picture. I'm escalating now with full context.`,
      route,
      escalate: true,
      urgency: 'normal',
      identifiedNeed: route.needType,
      recommendedAction: 'Human HNaaS specialist review of multi-issue request.',
      dataTags,
      agentId: baseAgentId,
    };
  }

  // 5. FM KNOWLEDGE-BASE ANSWER (Feature 2)
  const kb = retrieve(message);
  if (kb) {
    let reply = kb.answer;
    if (kb.clinicianNote) {
      reply +=
        '\n\nThis is general education, not medical advice — the specifics for your situation are a conversation to have with your clinician, and I can help you prepare for it.';
    }
    return {
      reply,
      route: { needType: 'fm education', routedTo: null, reason: `KB topic: ${kb.topic}.`, confidence: 0.8 },
      escalate: false,
      urgency: 'normal',
      identifiedNeed: `Education: ${kb.topic}`,
      recommendedAction: 'None — handled by Care Navigator.',
      dataTags: { ...dataTags, educationTopic: kb.id },
      agentId: baseAgentId,
    };
  }

  // 6. GREETING / FALLBACK with a clarifying question (Feature 2: ask, don't assume)
  const lead = GREETING_PATTERN.test(message) ? `${greetingLine(ctx)} ` : '';
  return {
    reply:
      `${lead}I'm here to help you navigate life with fibromyalgia — whether that's understanding your ` +
      `condition, dealing with insurance, finding the right specialist, or just having support. ` +
      `Can you tell me a bit more about what you need help with today?`,
    route: { needType: 'clarify', routedTo: null, reason: 'No clear intent; asking a clarifying question.', confidence: 0.5 },
    escalate: false,
    urgency: 'normal',
    identifiedNeed: 'Clarification needed',
    recommendedAction: 'None — gathering intent.',
    dataTags,
    agentId: baseAgentId,
  };
}
