import { memo, useState } from "react";
import { PixelRatio, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { imageUrl, widthForLayout } from "../lib/imageUrl";
import { colors } from "../lib/theme";

// A swipeable gallery inside a grid card.
//
// WHY THE TAP TARGET IS PER-IMAGE. Wrapping this whole component in a <Pressable> which is what
// the card used to do. Makes the Pressable claim the touch, and the horizontal pan never reaches
// the ScrollView. The swipe silently did nothing. A Pressable INSIDE a ScrollView is different: the
// ScrollView owns the pan, and the Pressable only fires when the finger doesn't travel. So the tap
// target moves onto each image and the outer wrapper goes away.

function CardGallery({
  images, width, height, onPress,
}: { images: string[]; width: number; height: number; onPress?: () => void }) {
  const [active, setActive] = useState(0);
  const shown = images.slice(0, 8);
  // Ask each store's CDN for a card-sized photo instead of the original it uploaded. Measured on a
  // real listing: 2,056,519 bytes for the original against 50,870 at this size, for a tile an inch
  // and a half wide. Twenty of those on screen was the app feeling slow.
  const px = widthForLayout(width, PixelRatio.get());

  if (!shown.length) {
    return <Pressable onPress={onPress}><View style={{ width, height, backgroundColor: colors.bgCard }} /></Pressable>;
  }

  // ONE IMAGE, NO SCROLLVIEW. A paging ScrollView per card is the expensive thing in this grid,
  // twenty cards on screen meant twenty nested scroll views, and a card with a single photograph
  // has nothing to page through. Most pieces have one image, so most cards stop paying for it.
  if (shown.length === 1) {
    return (
      <Pressable onPress={onPress} style={{ width, height, backgroundColor: colors.bgCard }}>
        <Image source={{ uri: imageUrl(shown[0], px) }} style={{ width, height }} contentFit="cover" transition={140} recyclingKey={shown[0]} />
      </Pressable>
    );
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
            {/* Only the frames you can reach are real images; the rest are correctly-sized empties,
                so the ScrollView's content width, and therefore paging. Is unchanged while the
                card mounts two image views instead of eight. Swiping mounts the next one. */}
            {i <= active + 1 ? (
              <Image
                source={{ uri: imageUrl(uri, px) }}
                style={{ width, height }}
                contentFit="cover"
                transition={140}
                // Recycled cells otherwise show the previous piece's photo for a frame.
                recyclingKey={uri}
                priority={i === 0 ? "normal" : "low"}
              />
            ) : (
              <View style={{ width, height, backgroundColor: colors.bgCard }} />
            )}
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

// Memoized: a grid re-renders on every favourite toggle and every fetch, and without this each of
// those re-rendered every gallery on screen.
export default memo(CardGallery);
