import type { LucideIcon } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const hasError = errors.length > 0;
  const inputType = showPasswordToggle ? (showPassword ? 'text' : 'password') : type;
  const hasLeftIcon = !!Icon;
  const hasRightIcon = showPasswordToggle;

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-2.5 size-4 text-muted-foreground" />}
        <Input
          id={name}
          type={inputType}
          placeholder={placeholder}
          className={`${hasLeftIcon ? 'pl-10' : ''} ${hasRightIcon ? 'pr-10' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
        />
        {showPasswordToggle && onTogglePassword && (
          <button
            type="button"
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={onTogglePassword}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {hasError ? (
        <p className="text-xs text-destructive">{errors[0]}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
