import { useState } from 'react';
import {
  PixelRatio,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const cardSize = PixelRatio.roundToNearestPixel(120);

const radii = {
  dp: {
    label: 'radii in dp',
    equal: { borderRadius: cardSize / 4 },
    uneven: {
      borderRadius: cardSize / 4,
      borderBottomRightRadius: cardSize / 10,
    },
  },
  percentage: {
    label: 'radii as percentages',
    equal: { borderRadius: '25%' },
    uneven: { borderRadius: '25%', borderBottomRightRadius: '10%' },
  },
} as const;

type RadiusUnit = keyof typeof radii;

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <ElevatedCards />
    </SafeAreaProvider>
  );
}

function ElevatedCards() {
  const safeAreaInsets = useSafeAreaInsets();
  const [unit, setUnit] = useState<RadiusUnit>('dp');
  const shown = radii[unit];

  return (
    <View style={[styles.screen, { paddingTop: safeAreaInsets.top + 72 }]}>
      <View
        accessible
        accessibilityLabel="card with four equal radii"
        style={[styles.card, shown.equal]}
      />
      <View
        accessible
        accessibilityLabel="card with uneven radii"
        style={[styles.card, styles.secondCard, shown.uneven]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown.label}
        onPress={() => setUnit(unit === 'dp' ? 'percentage' : 'dp')}
        style={[styles.button, { bottom: safeAreaInsets.bottom + 48 }]}
      >
        <Text style={styles.buttonText}>
          {unit === 'dp'
            ? `borderRadius: ${(cardSize / 4).toFixed(2)}, borderBottomRightRadius: ${(cardSize / 10).toFixed(2)}`
            : "borderRadius: '25%', borderBottomRightRadius: '10%'"}
        </Text>
        <Text style={styles.hint}>Tap to switch</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#eceff1',
  },
  card: {
    width: cardSize,
    height: cardSize,
    backgroundColor: '#ffffff',
    elevation: 16,
  },
  secondCard: {
    marginTop: 120,
  },
  button: {
    position: 'absolute',
    left: 24,
    right: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  buttonText: {
    fontSize: 15,
    color: '#0b1b33',
    textAlign: 'center',
  },
  hint: {
    marginTop: 4,
    fontSize: 13,
    color: '#57606a',
    textAlign: 'center',
  },
});

export default App;
