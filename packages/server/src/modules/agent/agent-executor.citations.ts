import { agentConfig } from '@core/config/env';
import type { AgentTool } from './tools';
import type { AgentStep, AgentStopReason, Citation } from '@knowledge-agent/shared/types';
import type {
  AgentExecutorResult,
  BuildAgentExecutorResultInput,
  TaggedCitation,
} from './agent-executor.types';

function getCitationKey(citation: Citation): string {
  if (citation.sourceType === 'node') {
    return `node:${citation.documentId}:${citation.indexVersion ?? ''}:${citation.nodeId}`;
  }

  return `chunk:${citation.documentId}:${citation.documentVersion ?? ''}:${citation.chunkIndex}`;
}

function normalizeScore(rawScore: number | undefined, toolName: string): number {
  switch (toolName) {
    case 'outline_search':
      return Math.min((rawScore ?? 0) / agentConfig.citationOutlineScoreCeiling, 1.0);
    case 'knowledge_base_search':
    case 'vector_fallback_search':
      return rawScore ?? 0;
    case 'node_read':
      return agentConfig.citationNodeReadBaseScore;
    case 'ref_follow':
      return agentConfig.citationRefFollowBaseScore;
    default:
      return rawScore ?? 0;
  }
}

function isAncestorPath(ancestor: string[], descendant: string[]): boolean {
  if (ancestor.length === 0 || ancestor.length >= descendant.length) return false;
  return ancestor.every((seg, i) => seg === descendant[i]);
}

function filterSectionRedundancy(candidates: TaggedCitation[]): TaggedCitation[] {
  const byDoc = new Map<string, TaggedCitation[]>();
  const nonParticipating: TaggedCitation[] = [];

  for (const tc of candidates) {
    const citation = tc.citation;
    if (citation.sourceType === 'node' && citation.sectionPath && citation.sectionPath.length > 0) {
      const group = byDoc.get(citation.documentId) ?? [];
      group.push(tc);
      byDoc.set(citation.documentId, group);
    } else {
      nonParticipating.push(tc);
    }
  }

  const result: TaggedCitation[] = [...nonParticipating];

  for (const group of byDoc.values()) {
    group.sort(
      (a, b) => (b.citation.sectionPath?.length ?? 0) - (a.citation.sectionPath?.length ?? 0)
    );

    const removed = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      if (removed.has(i)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (removed.has(j)) continue;
        const deep = group[i]!;
        const shallow = group[j]!;
        const deepPath = deep.citation.sectionPath!;
        const shallowPath = shallow.citation.sectionPath!;

        if (isAncestorPath(shallowPath, deepPath)) {
          const diff = (shallow.normalizedScore ?? 0) - (deep.normalizedScore ?? 0);
          if (diff > agentConfig.citationParentScoreAdvantage) {
            removed.add(i);
          } else {
            removed.add(j);
          }
        }
      }
    }

    for (let i = 0; i < group.length; i++) {
      if (!removed.has(i)) result.push(group[i]!);
    }
  }

  return result;
}

function finalizeCitations(tagged: TaggedCitation[], maxItems: number = 8): Citation[] {
  const deduped = new Map<string, TaggedCitation>();
  for (const tc of tagged) {
    const key = getCitationKey(tc.citation);
    const normalizedScore = normalizeScore(tc.citation.score, tc.toolName);
    const entry: TaggedCitation = { ...tc, normalizedScore };
    const previous = deduped.get(key);
    if (!previous || normalizedScore > (previous.normalizedScore ?? 0)) {
      deduped.set(key, entry);
    }
  }

  let candidates = filterSectionRedundancy([...deduped.values()]).filter(
    (tc) => (tc.normalizedScore ?? 0) >= agentConfig.citationMinScore
  );

  if (candidates.length <= maxItems) {
    return candidates
      .sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0))
      .map((tc) => tc.citation);
  }

  const byDoc = new Map<string, TaggedCitation[]>();
  for (const tc of candidates) {
    const group = byDoc.get(tc.citation.documentId) ?? [];
    group.push(tc);
    byDoc.set(tc.citation.documentId, group);
  }

  const selected = new Set<string>();
  const result: TaggedCitation[] = [];
  const docBests: TaggedCitation[] = [];

  for (const group of byDoc.values()) {
    group.sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));
    docBests.push(group[0]!);
  }

  docBests.sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));

  const guaranteeSlots = Math.min(
    docBests.length,
    maxItems,
    Math.max(agentConfig.citationMinDocuments, 1)
  );
  for (let i = 0; i < guaranteeSlots; i++) {
    const tc = docBests[i]!;
    selected.add(getCitationKey(tc.citation));
    result.push(tc);
  }

  candidates = candidates
    .filter((tc) => !selected.has(getCitationKey(tc.citation)))
    .sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));

  for (const tc of candidates) {
    if (result.length >= maxItems) break;
    result.push(tc);
  }

  return result
    .sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0))
    .map((tc) => tc.citation);
}

function hasKnowledgeTool(tools: AgentTool[]): boolean {
  return tools.some(
    (tool) => tool.definition.category === 'structured' || tool.definition.category === 'fallback'
  );
}

function finalizeStopReason(input: {
  stopReason: AgentStopReason;
  tools: AgentTool[];
  finalCitations: Citation[];
  agentTrace: AgentStep[];
}): AgentStopReason {
  if (input.stopReason !== 'answered') return input.stopReason;

  if (
    hasKnowledgeTool(input.tools) &&
    input.agentTrace.length > 0 &&
    input.finalCitations.length === 0
  ) {
    return 'insufficient_evidence';
  }

  return input.stopReason;
}

export function buildAgentExecutorResult(
  input: BuildAgentExecutorResultInput
): AgentExecutorResult {
  const finalCitations = finalizeCitations(input.citations);

  return {
    content: input.content,
    citations: finalCitations,
    retrievedCitations: input.citations.map((tc) => tc.citation),
    agentTrace: input.agentTrace,
    agentMessages: input.agentMessages,
    stopReason: finalizeStopReason({
      stopReason: input.stopReason,
      tools: input.tools,
      finalCitations,
      agentTrace: input.agentTrace,
    }),
  };
}
