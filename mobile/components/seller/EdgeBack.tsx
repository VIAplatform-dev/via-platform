import { router } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

// Drag from the left edge to go back.
//
// WHY THIS EXISTS RATHER THAN THE NAVIGATOR'S OWN GESTURE. Every screen in the seller workspace is
// a TAB (see app/(seller)/_layout.tsx: five in the bar, the rest `href: null`). A tab navigator has
// no back gesture at all, so an edge swipe fell through to the ROOT stack and popped the whole
// (seller) group: swiping on Shipping did not go back to Settings, it dropped her in the
// marketplace's Account tab. That gesture is switched off now, which stopped the wrong behaviour
// and left no right one: swiping did nothing.
//
// This is the right one. `backBehavior="history"` on the tabs means router.back() walks the tabs
// she actually visited, in order, which is exactly what the chevron in the header already does.
//
// THREE CONDITIONS, so it never fires by accident:
//   · it must START within 40pt of the left edge, which is where a back swipe starts and where no
//     row's own content begins;
//   · it must travel more than 60pt to the right, so a hesitant touch is not a navigation;
//   · it must fail on vertical movement, so scrolling a long form never triggers it. failOffsetY
//     is what yields to the ScrollView rather than fighting it.

/** How close to the left edge a back swipe has to begin. */
const EDGE = 40;
/** How far it has to travel before it counts. */
const TRAVEL = 60;

export function useEdgeBack(enabled = true) {
  const back = () => {
    if (router.canGoBack()) router.back();
  };

  return Gesture.Pan()
    .enabled(enabled)
    // Only a rightward drag, and only once it is clearly horizontal.
    .activeOffsetX(20)
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      // absoluteX is where her finger IS; minus how far it moved is where it STARTED.
      const startedAt = e.absoluteX - e.translationX;
      if (startedAt <= EDGE && e.translationX > TRAVEL) runOnJS(back)();
    });
}

/** The same gesture as a wrapper, for a screen that draws its own scroll view. */
export function EdgeBack({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  return <GestureDetector gesture={useEdgeBack(enabled)}>{children as React.ReactElement}</GestureDetector>;
}
