import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  compact?: boolean;
  className?: string;
}

export function LanguageToggle({ compact = false, className }: LanguageToggleProps) {
  const { t, i18n } = useTranslation('language');
  const language =
    SUPPORTED_LANGUAGES.find((lng) => lng === i18n.resolvedLanguage || lng === i18n.language) ??
    DEFAULT_LANGUAGE;
  const label = language === 'zh-CN' ? t('zh') : t('en');
  const compactLabel = language === 'zh-CN' ? '中' : 'EN';

  const handleToggle = () => {
    const nextLanguage: Language = language === 'zh-CN' ? 'en-US' : 'zh-CN';
    void i18n.changeLanguage(nextLanguage);
    localStorage.setItem('knowledge-agent.language', nextLanguage);
    document.documentElement.lang = nextLanguage;
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      className={cn('cursor-pointer', className)}
      onClick={handleToggle}
      aria-label={t('switch')}
      title={t('switch')}
    >
      <Languages className="size-4" />
      {compact ? (
        <span className="text-[11px] font-semibold">{compactLabel}</span>
      ) : (
        <span className="text-xs">{label}</span>
      )}
    </Button>
  );
}
