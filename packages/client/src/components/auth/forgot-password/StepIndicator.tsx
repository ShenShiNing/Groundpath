import type { ResetStep } from './types';
import { RESET_STEPS } from './types';

export function StepIndicator({ currentStep }: { currentStep: ResetStep }) {
  const currentIndex = RESET_STEPS.indexOf(currentStep);

  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      {RESET_STEPS.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              index <= currentIndex ? 'bg-primary' : 'bg-muted'
            }`}
          />
          {index < RESET_STEPS.length - 1 && (
            <div
              className={`h-0.5 w-8 transition-colors ${
                index < currentIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
