export const hairStyles = ["spiky", "short", "wavy"] as const;
export const outfits = ["classic", "hoodie", "vest"] as const;
export type HairStyle = (typeof hairStyles)[number];
export type Outfit = (typeof outfits)[number];

export type AvatarLook = {
  hairStyle: HairStyle;
  outfit: Outfit;
  hair: string;
  skin: string;
  eyes: string;
  jacket: string;
  coat: string;
  accent: string;
};

export const defaultLook: AvatarLook = {
  hairStyle: "spiky",
  outfit: "classic",
  hair: "#36213f",
  skin: "#f5b88d",
  eyes: "#81589c",
  jacket: "#694890",
  coat: "#9d83c0",
  accent: "#f2e96d",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function colorNumber(hex: string) {
  return Number.parseInt(hex.slice(1), 16);
}

const LOOK_KEYS = [
  "hairStyle",
  "outfit",
  "hair",
  "skin",
  "eyes",
  "jacket",
  "coat",
  "accent",
] as const;

export function parseLook(raw: unknown): AvatarLook | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const look = raw as Record<string, unknown>;
  const keys = Object.keys(look);
  if (
    keys.length !== LOOK_KEYS.length ||
    LOOK_KEYS.some((key) => !keys.includes(key))
  )
    return null;
  if (!hairStyles.includes(look.hairStyle as HairStyle)) return null;
  if (!outfits.includes(look.outfit as Outfit)) return null;
  for (const key of [
    "hair",
    "skin",
    "eyes",
    "jacket",
    "coat",
    "accent",
  ] as const)
    if (!isHexColor(look[key])) return null;
  return normalizeLook(look);
}

export function looksEqual(a: AvatarLook, b: AvatarLook) {
  return (
    a.hairStyle === b.hairStyle &&
    a.outfit === b.outfit &&
    a.hair === b.hair &&
    a.skin === b.skin &&
    a.eyes === b.eyes &&
    a.jacket === b.jacket &&
    a.coat === b.coat &&
    a.accent === b.accent
  );
}

export function normalizeLook(raw: unknown): AvatarLook {
  const look =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    hairStyle: hairStyles.includes(look.hairStyle as HairStyle)
      ? (look.hairStyle as HairStyle)
      : defaultLook.hairStyle,
    outfit: outfits.includes(look.outfit as Outfit)
      ? (look.outfit as Outfit)
      : defaultLook.outfit,
    hair: isHexColor(look.hair) ? look.hair.toLowerCase() : defaultLook.hair,
    skin: isHexColor(look.skin) ? look.skin.toLowerCase() : defaultLook.skin,
    eyes: isHexColor(look.eyes) ? look.eyes.toLowerCase() : defaultLook.eyes,
    jacket: isHexColor(look.jacket)
      ? look.jacket.toLowerCase()
      : defaultLook.jacket,
    coat: isHexColor(look.coat) ? look.coat.toLowerCase() : defaultLook.coat,
    accent: isHexColor(look.accent)
      ? look.accent.toLowerCase()
      : defaultLook.accent,
  };
}

export const swatches = {
  hair: [
    "#36213f",
    "#1a1214",
    "#6b3a1f",
    "#c4783a",
    "#e8c36a",
    "#f3efe8",
    "#2d4a7c",
    "#8b2d4a",
  ],
  skin: [
    "#f5b88d",
    "#f3d0b0",
    "#ffe0bd",
    "#d08b5b",
    "#c68642",
    "#8d5524",
    "#5c3310",
  ],
  eyes: ["#81589c", "#3d5a80", "#2f6b4f", "#5c3d1e", "#4a90c8", "#1f1f1f"],
  jacket: ["#694890", "#2c3e6b", "#8b3a3a", "#3d6b4a", "#2a2a2a", "#c45c26"],
  coat: ["#9d83c0", "#5a6fa8", "#d4896a", "#6b8f71", "#4a4a4a", "#e8a87c"],
  accent: ["#f2e96d", "#f7c59f", "#9ad4c0", "#f28b82", "#ffffff", "#ffd166"],
} as const;

export function matchingPreset(look: AvatarLook) {
  return presets.find((preset) => looksEqual(normalizeLook(preset.look), look))
    ?.id;
}

export const presets: { id: string; label: string; look: AvatarLook }[] = [
  { id: "classic", label: "Classic", look: { ...defaultLook } },
  {
    id: "sunrise",
    label: "Sunrise",
    look: {
      hairStyle: "wavy",
      outfit: "hoodie",
      hair: "#c4783a",
      skin: "#f3d0b0",
      eyes: "#3d5a80",
      jacket: "#c45c26",
      coat: "#d4896a",
      accent: "#ffd166",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    look: {
      hairStyle: "short",
      outfit: "vest",
      hair: "#1a1214",
      skin: "#f5b88d",
      eyes: "#4a90c8",
      jacket: "#2c3e6b",
      coat: "#5a6fa8",
      accent: "#ffffff",
    },
  },
  {
    id: "garden",
    label: "Garden",
    look: {
      hairStyle: "spiky",
      outfit: "classic",
      hair: "#2f6b4f",
      skin: "#d08b5b",
      eyes: "#2f6b4f",
      jacket: "#3d6b4a",
      coat: "#6b8f71",
      accent: "#f2e96d",
    },
  },
];
