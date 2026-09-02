import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { imageUrl } from "../lib/imageUrl";
import { colors } from "../lib/theme";

// A swipeable gallery inside a grid card.
//
// WHY THE TAP TARGET IS PER-IMAGE. Wrapping this whole component in a <Pressable> — which is what
// the card used to do — makes the Pressable claim the touch, and the horizontal pan never reaches
// the ScrollView. The swipe silently did nothing. A Pressable INSIDE a ScrollView is different: the
// ScrollView owns the pan, and the Pressable only fires when the finger doesn't travel. So the tap
// target moves onto each image and the outer wrapper goes away.

export default function CardGallery({
  images, width, height, onPress,
}: { images: string[]; width: number; height: number; onPress?: () => void }) {
  const [active, setActive] = useState(0);
  const shown = images.slice(0, 8);

  if (!shown.length) {
    return <Pressable onPress={onPress}><View style={{ width, height, backgroundColor: colors.bgCard }} /></Pressable>;
  }

  return (
    <View style={{ width, height, backgroundColor: colors.bgCard }}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {shown.map((uri, i) => (
          <Pressable key={`${uri}-${i}`} onPress={onPress}>
            <Image
              source={{ uri: imageUrl(uri) }}
              style={{ width, height }}
              contentFit="cover"
              transition={140}
              // Only the first frame is eager; the rest load as they're swiped to, so a grid of
              // forty cards doesn't fetch three hundred photographs on mount.
              priority={i === 0 ? "normal" : "low"}
            />
          </Pressable>
        ))}
      </ScrollView>

      {shown.length > 1 ? (
        <View style={{ position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 }} pointerEvents="none">
          {shown.map((uri, i) => (
            <View key={`${uri}-dot-${i}`} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i === active ? "#FFFFFF" : "rgba(255,255,255,0.5)" }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
