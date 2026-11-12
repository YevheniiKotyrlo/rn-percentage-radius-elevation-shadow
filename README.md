# Android: a percentage `borderRadius` gives a view's elevation shadow corners multiplied by the screen density

![Build](https://github.com/YevheniiKotyrlo/rn-percentage-radius-elevation-shadow/workflows/Pre%20Merge%20Checks/badge.svg)

React Native 0.90.0-nightly-20261112-897cca827, from the [React Native reproducer template](https://github.com/react-native-community/reproducer-react-native). `App.tsx` renders two white 120×120 cards with `elevation: 16`: one with four equal radii, a quarter of its width, and one with uneven radii, its bottom-right radius a tenth of its width. A button switches both cards between the radii in dp (`cardSize / 4`, `cardSize / 10`) and the same radii as percentages (`'25%'`, `'10%'`).

## Steps

By hand, on an Android 11 or newer device:

1. Build and install the release APK: `cd ReproducerApp/android && ./gradlew assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk`.
2. Open the app and tap the button. The cards keep their shape, but with the radii as percentages their shadows' corners are the radii multiplied by the screen density, up to half the card: on a 3x screen the first card casts a circle's shadow.

Scripted: `./reproduce.sh`, with one Android 11 or newer device attached, builds and installs the app, takes a screenshot with the radii in dp, as percentages and in dp again, and compares the pixels around each card. It exits 1 while a card's shadow differs between the radii in dp and as percentages, 0 once it is the same, and 2 when a step fails or the card's two renders in dp differ. The screenshots land in `screenshots/`.
