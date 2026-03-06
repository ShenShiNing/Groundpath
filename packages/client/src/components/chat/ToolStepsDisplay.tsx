import { ToolStepCard } from './ToolStepCard';
import type { ToolStep } from '@/stores';

export interface ToolStepsDisplayProps {
  steps: ToolStep[];
}

export function ToolStepsDisplay({ steps }: ToolStepsDisplayProps) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {steps.map((step) => (
        <ToolStepCard key={step.stepIndex} step={step} />
      ))}
    </div>
  );
}
