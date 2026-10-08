import { Svg, Circle, G } from 'react-native-svg';
import { YStack } from 'tamagui';
import { Text } from './Text';

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
}

/**
 * Minimal donut chart built on react-native-svg, so it renders identically on
 * iOS, Android and web (react-native-svg maps to DOM <svg>). Each slice is a
 * circle stroke with a dash offset; a 2° gap separates slices.
 */
export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + d.value, 0);
  const gap = data.length > 1 ? (2 / 360) * circumference : 0;

  const visible = data.filter((d) => d.value > 0);
  const lengths = visible.map((d) => (total > 0 ? (d.value / total) * circumference : 0));
  const arcs = visible.map((d, i) => ({
    ...d,
    dash: Math.max((lengths[i] ?? 0) - gap, 0.5),
    // Start of this slice = sum of the slices before it.
    offset: lengths.slice(0, i).reduce((s, l) => s + l, 0),
  }));

  return (
    <YStack
      width={size}
      height={size}
      items="center"
      justify="center"
      accessibilityRole="image"
      accessibilityLabel={`Spending chart${centerValue ? `, total ${centerValue}` : ''}`}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(127,127,127,0.12)"
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      {centerValue ? (
        <YStack position="absolute" items="center">
          {centerLabel ? (
            <Text fontSize={12} color="$color10">
              {centerLabel}
            </Text>
          ) : null}
          <Text fontSize={18} fontWeight="800" color="$color12">
            {centerValue}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}
