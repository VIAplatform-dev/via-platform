import { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, pill } from "../../lib/portal-theme";

// One photograph, full size, with the controls for where it sits in the piece.
//
// The grid answers "which order are these in". This answers "is this one any good", which is a
// question about a 76pt thumbnail nobody can honestly answer. She is judging focus, a flaw, whether
// the label is readable. So: the whole screen, on black, and swipe through the rest of the roll.
//
// THE POSITION CONTROLS ARE HERE TOO, and not only because she asked for them here. Dragging is
// the fast way to reorder and it is also the way that needs a steady hand, a visible grid and
// enough of the screen to drag across. "Make cover" is one tap, it works from inside the photo she
// is actually looking at, and it is the only one of the two that VoiceOver can drive at all.
//
// Black, whatever the workspace palette is. This screen is a photograph and nothing else, and a
// coloured surround changes how the photograph reads.

export function PhotoViewer({
  photos, index, onClose, onMove, onRemove,
}: {
  photos: string[];
  /** Which photo she opened. null closes the viewer. */
  index: number | null;
  onClose: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [at, setAt] = useState(index ?? 0);

  // Opening on photo five has to START on photo five, and the viewer stays mounted between opens
  // (its parents render it unconditionally), so `at` cannot simply be initial state.
  //
  // Adjusted during render rather than in an effect. React re-runs this component immediately,
  // before anything is painted, so she never sees the frame where the pager is still on the photo
  // she opened LAST time. An effect doing the same setState paints that frame first.
  const [openedOn, setOpenedOn] = useState(index);
  if (index !== openedOn) {
    setOpenedOn(index);
    setAt(index ?? 0);
  }

  // The scroll itself is imperative and belongs in an effect. Not animated: animating it would
  // scroll visibly past four photographs she did not ask to see.
  useEffect(() => {
    if (index === null) return;
    requestAnimationFrame(() => scroller.current?.scrollTo({ x: index * width, animated: false }));
  }, [index, width]);

  if (index === null || photos.length === 0) return null;

  /** Follow the photo, not the slot. She moved THIS picture; keep it under her eyes. */
  const move = (to: number) => {
    const target = Math.max(0, Math.min(photos.length - 1, to));
    if (target === at) return;
    onMove(at, target);
    setAt(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };

  /**
   * Removing has to decide where she ends up BEFORE the photo goes, because afterwards the index
   * she is on may not exist any more. Deleting the only photo closes the viewer; deleting the last
   * one steps back to its neighbour. Doing this here rather than in an effect that watches the
   * length is what keeps it off the render path: a pager that corrects itself a frame later shows
   * her a blank page reading "4 of 3" first.
   */
  const confirmRemove = () => {
    Alert.alert("Remove this photo?", "A shot taken in VYA isn't in your camera roll, so this can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          const wasLastLeft = photos.length === 1;
          const wasAtEnd = at === photos.length - 1;
          if (!wasLastLeft && wasAtEnd) {
            setAt(at - 1);
            scroller.current?.scrollTo({ x: (at - 1) * width, animated: false });
          }
          onRemove(at);
          if (wasLastLeft) onClose();
        },
      },
    ]);
  };

  const isCover = at === 0;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />

        <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", color: "#fff", fontSize: 15 }}>
            {isCover ? "Cover photo" : `${at + 1} of ${photos.length}`}
          </Text>
          <Pressable onPress={confirmRemove} hitSlop={12} accessibilityLabel="Remove photo">
            <Feather name="trash-2" size={21} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {photos.map((uri, i) => (
            <View key={`${uri}-${i}`} style={{ width, alignItems: "center", justifyContent: "center" }}>
              {/* contain, never cover: this screen exists so she can see the whole frame, and a
                  cropped preview of a photo she is judging would be worse than the thumbnail. */}
              <Image source={{ uri }} style={{ width, height: height * 0.62 }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <Pressable
            onPress={() => move(0)}
            disabled={isCover}
            style={{ backgroundColor: isCover ? "rgba(255,255,255,0.10)" : "#fff", borderRadius: pill, paddingVertical: spacing.md, alignItems: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: isCover ? "rgba(255,255,255,0.5)" : "#1C1917" }}>
              {isCover ? "This is the cover" : "Make this the cover"}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {([["chevron-left", "Move back", at - 1, at === 0], ["chevron-right", "Move forward", at + 1, at === photos.length - 1]] as const).map(
              ([icon, label, to, disabled]) => (
                <Pressable
                  key={label}
                  onPress={() => move(to)}
                  disabled={disabled}
                  accessibilityLabel={label}
                  style={{ flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: pill, paddingVertical: spacing.md, opacity: disabled ? 0.35 : 1 }}
                >
                  <Feather name={icon} size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13 }}>{label}</Text>
                </Pressable>
              ),
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
