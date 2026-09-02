import { useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "./api";
import { useAuth } from "./auth";
import type { SavedSearch } from "./types";

// Saving the view you are looking at as a standing search.
//
// The name is what the person will see in Obsessions › Searches, so it is the screen's own title
// ("Shoes", "Bridal Era") rather than a serialised filter string.

export function useSaveSearch() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (v: { name: string; filters: Record<string, unknown> }) =>
      apiPost<{ search: SavedSearch }>("/api/mobile/saved-searches", v),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
    },
    onError: (e) => Alert.alert("Couldn’t save", e instanceof Error ? e.message : "Try again."),
  });

  function onSave(name: string, filters: Record<string, unknown>) {
    if (!user) {
      Alert.alert("Sign in to save", "Saved searches tell you when something new matches.");
      return;
    }
    if (saved) return; // already standing; saving twice would just make a duplicate
    save.mutate({ name, filters });
  }

  return { saved, onSave, canSave: Boolean(user) };
}
