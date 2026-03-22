import { z } from '@groundpath/shared/schemas';

/** Helper for boolean env vars */
export const booleanString = (defaultValue: boolean = false) =>
  z
    .string()
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true');

/** Helper for comma-separated string arrays */
export const csvStringArray = () =>
  z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
