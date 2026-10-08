import { Text as TamaguiText, type TextProps } from 'tamagui';

/**
 * Tamagui derives line-height from the font *size token*, so an explicit
 * numeric fontSize keeps the default line-height and large text overlaps.
 * This wrapper gives numeric sizes a proportional line-height (1.3×) unless
 * one is passed explicitly.
 */
export function Text({ fontSize, lineHeight, text, textAlign, ...props }: TextProps) {
  // Pressable on web renders a <button>-like element whose centred text-align
  // would otherwise be inherited; default to start alignment explicitly.
  const align = text ?? textAlign ?? 'left';
  const computed = lineHeight ?? (typeof fontSize === 'number' ? Math.round(fontSize * 1.3) : undefined);
  return <TamaguiText fontSize={fontSize} lineHeight={computed} text={align} {...props} />;
}

export type { TextProps };
