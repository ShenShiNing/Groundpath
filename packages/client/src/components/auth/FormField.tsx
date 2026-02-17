import type { LucideIcon } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
  icon?: LucideIcon;
  errors?: string[];
  hint?: string;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

function PasswordToggleButton({
  showPassword,
  onToggle,
}: {
  showPassword: boolean;
  onToggle: () => void;
}) {
  const Icon = showPassword ? EyeOff : Eye;
  return (
    <button
      type="button"
      className="absolute right-3 top-2.5 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
      onClick={onToggle}
      tabIndex={-1}
    >
      <Icon className="size-4" />
    </button>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (hint) {
    return <p className="text-xs text-muted-foreground">{hint}</p>;
  }
  return null;
}

function getInputType(type: string, showPasswordToggle?: boolean, showPassword?: boolean): string {
  if (!showPasswordToggle) return type;
  return showPassword ? 'text' : 'password';
}

export function FormField({
  name,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  disabled,
  required,
  icon: Icon,
  errors = [],
  hint,
  showPasswordToggle,
  showPassword,
  onTogglePassword,
}: FormFieldProps) {
  const inputType = getInputType(type, showPasswordToggle, showPassword);

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-2.5 size-4 text-muted-foreground" />}
        <Input
          id={name}
          type={inputType}
          placeholder={placeholder}
          className={cn(Icon && 'pl-10', showPasswordToggle && 'pr-10')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
        />
        {showPasswordToggle && onTogglePassword && (
          <PasswordToggleButton showPassword={!!showPassword} onToggle={onTogglePassword} />
        )}
      </div>
      <FieldMessage error={errors[0]} hint={hint} />
    </div>
  );
}
