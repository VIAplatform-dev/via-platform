import { useState } from "react";
import { Image, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { colors, spacing, radius } from "../../lib/portal-theme";
import { dropIndex, perRowFor } from "../../lib/seller/photo-order";

// Her photographs, in the order they will go up in, and draggable into a different one.
//
// PRESS AND MOVE, because that is what she said and it is what every other app she uses does. A
// long press picks the thumbnail up (it lifts and follows the finger), everything else slides out
// of the way live, and letting go drops it. A plain tap opens it full size instead.
//
// THE FIRST ONE IS LABELLED. "Cover" is not a detail: photo one is the entire marketplace grid,
// the push notification and the storefront rail, and a seller cannot be expected to infer that
// position one is special from position one looking identical to position two.
//
// It replaced three separate `photos.slice(0, 4)` strips (Capture, Details, Review). Those were
// not just unsortable, they were a LIE about how many photos the piece had: shoot eight and the
// screen showed four, with nothing saying the rest existed.

const GAP = spacing.sm;

function Thumb({
  uri, index, count, cell, pitch, perRow, dragging, target, tx, ty, dark, onMove, onOpen,
}: {
  uri: string;
  index: number;
  count: number;
  cell: number;
  pitch: number;
  perRow: number;
  dragging: { value: number };
  target: { value: number };
  tx: { value: number };
  ty: { value: number };
  dark: boolean;
  onMove: (from: number, to: number) => void;
  onOpen: (index: number) => void;
}) {
  const homeX = (index % perRow) * pitch;
  const homeY = Math.floor(index / perRow) * pitch;

  // A long press ARMS the drag rather than starting it on touch-down, so this can live inside a
  // ScrollView without stealing every vertical swipe that begins on a photograph.
  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      dragging.value = index;
      target.value = index;
      tx.value = 0;
      ty.value = 0;
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      target.value = dropIndex(index, e.translationX, e.translationY, { perRow, pitch, count });
    })
    .onEnd(() => {
      if (target.value !== index) runOnJS(onMove)(index, target.value);
    })
    // onFinalize, not onEnd: a drag cancelled by a phone call or a competing gesture still has to
    // put the thumbnail back down. Without this it stays lifted and stuck under the finger's last
    // position, and the grid looks broken until the screen is left.
    .onFinalize(() => {
      dragging.value = -1;
      tx.value = 0;
      ty.value = 0;
    });

  const tap = Gesture.Tap().maxDuration(250).onEnd(() => runOnJS(onOpen)(index));

  const style = useAnimatedStyle(() => {
    const held = dragging.value;
    const lifted = held === index;

    // Where this thumbnail sits WHILE something else is being dragged over it. Everything between
    // the photo's old home and where it is hovering shuffles up or down by one, which is what
    // makes the gap appear under the finger before she lets go.
    let slot = index;
    if (held >= 0 && !lifted) {
      const t = target.value;
      if (t > held && index > held && index <= t) slot = index - 1;
      else if (t < held && index >= t && index < held) slot = index + 1;
    }

    return {
      transform: [
        { translateX: lifted ? homeX + tx.value : withSpring((slot % perRow) * pitch, { damping: 20, stiffness: 220 }) },
        { translateY: lifted ? homeY + ty.value : withSpring(Math.floor(slot / perRow) * pitch, { damping: 20, stiffness: 220 }) },
        { scale: withTiming(lifted ? 1.1 : 1, { duration: 120 }) },
      ],
      // The held photo has to draw over its neighbours, and the shadow is how she can tell it is
      // in her hand rather than still in the grid.
      zIndex: lifted ? 20 : 0,
      shadowOpacity: withTiming(lifted ? 0.35 : 0, { duration: 120 }),
    };
  });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: cell,
            height: cell,
            borderRadius: radius,
            backgroundColor: dark ? "rgba(255,255,255,0.08)" : colors.chip,
            shadowColor: "#000",
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          },
          style,
        ]}
      >
        <Image source={{ uri }} style={{ width: cell, height: cell, borderRadius: radius }} />
        {index === 0 ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", borderBottomLeftRadius: radius, borderBottomRightRadius: radius, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 9, letterSpacing: 1.1, textAlign: "center" }}>COVER</Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoGrid({
  photos, onMove, onOpen, cell = 76, dark = false,
}: {
  photos: string[];
  onMove: (from: number, to: number) => void;
  onOpen: (index: number) => void;
  cell?: number;
  dark?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const dragging = useSharedValue(-1);
  const target = useSharedValue(-1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  if (photos.length === 0) return null;

  const pitch = cell + GAP;
  const perRow = perRowFor(width, cell, GAP);
  const rows = Math.ceil(photos.length / perRow);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View>
      {/* Absolutely positioned children, so a thumbnail can animate between slots rather than
          jumping when the array changes. The parent therefore has to be told its own height. */}
      <View onLayout={onLayout} style={{ height: rows * pitch - GAP }}>
        {/* Until the first layout lands there is no width, so no sensible column count. Rendering
            the thumbnails then would stack all of them at 0,0 and visibly snap apart a frame later. */}
        {width > 0
          ? photos.map((uri, i) => (
              <Thumb
                key={`${uri}-${i}`}
                uri={uri}
                index={i}
                count={photos.length}
                cell={cell}
                pitch={pitch}
                perRow={perRow}
                dragging={dragging}
                target={target}
                tx={tx}
                ty={ty}
                dark={dark}
                onMove={onMove}
                onOpen={onOpen}
              />
            ))
          : null}
      </View>
      <Text style={{ fontSize: 11, marginTop: spacing.sm, color: dark ? "rgba(255,255,255,0.55)" : colors.textDim }}>
        Hold and drag to reorder · tap to open
      </Text>
    </View>
  );
}
