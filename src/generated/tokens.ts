// Generated from docs/DESIGN.md. Do not edit.
export const tokens = {
  "colors": {
    "background": "#000000",
    "border": "#333333",
    "focus": "#E6E6E6",
    "scene-light": "#FFFFFF",
    "surface": "#101010",
    "text-primary": "#F2F2F2",
    "text-quiet": "#808080",
    "text-secondary": "#A8A8A8"
  },
  "typography": {
    "action": {
      "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "fontSize": "12px",
      "fontWeight": "400",
      "letterSpacing": "0.04em",
      "lineHeight": "18px",
      "textTransform": "lowercase"
    },
    "body": {
      "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "fontSize": "16px",
      "fontWeight": "400",
      "letterSpacing": "0",
      "lineHeight": "24px"
    },
    "metadata": {
      "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "fontSize": "12px",
      "fontWeight": "500",
      "letterSpacing": "0.16em",
      "lineHeight": "18px",
      "textTransform": "uppercase"
    },
    "quote": {
      "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "fontSize": "22px",
      "fontWeight": "400",
      "letterSpacing": "-0.01em",
      "lineHeight": "30px"
    },
    "reflection": {
      "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "fontSize": "18px",
      "fontWeight": "400",
      "letterSpacing": "0",
      "lineHeight": "27px"
    }
  },
  "spacing": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "24px",
    "6": "32px",
    "7": "48px",
    "8": "64px",
    "gutter-desktop": "32px",
    "gutter-mobile": "20px",
    "target": "44px"
  },
  "layout": {
    "breakpoint": "768px",
    "overlay-max-vvh": "45%"
  },
  "motion": {
    "birth-light": 600,
    "birth-settle": 1000,
    "birth-step": 800,
    "camera": 1600,
    "caption-delay": 3000,
    "cut": 400,
    "death-dissolve": 600,
    "death-extinguish": 200,
    "death-fall": 1600,
    "drift": 16000,
    "ease-fall": "cubic-bezier(0.55, 0, 1, 0.45)",
    "ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
    "event": 2400,
    "floor-rise": 1600,
    "key-change": 4000,
    "quote-hold": 1500,
    "reduced": 150,
    "ui": 200,
    "words": 600,
    "words-gap": 300
  },
  "render": {
    "attention-brightness-max": "1.2",
    "drift-tilt-max-deg": "0.5",
    "drift-travel-max-ratio": "0.005",
    "figure-height-ratio": "0.07",
    "floor-clip": "#FFFFFF",
    "grain-start": "2%",
    "slab-aspect": "2.4 / 1",
    "slab-thickness-ratio": "0.025"
  },
  "rounded": {
    "DEFAULT": "4px",
    "none": "0px"
  },
  "components": {
    "colophon": {
      "background": "#101010",
      "color": "#A8A8A8",
      "maxWidth": "480px"
    },
    "control-field": {
      "border": "#808080",
      "color": "#F2F2F2",
      "minHeight": "44px"
    },
    "controls-panel": {
      "background": "#101010",
      "color": "#F2F2F2",
      "padding": "24px",
      "radius": "4px",
      "width": "360px"
    },
    "enter": {
      "activeColor": "#F2F2F2",
      "color": "#A8A8A8",
      "minHeight": "44px",
      "minWidth": "44px",
      "typography": {
        "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "fontSize": "12px",
        "fontWeight": "400",
        "letterSpacing": "0.04em",
        "lineHeight": "18px",
        "textTransform": "lowercase"
      }
    },
    "figure": {
      "color": "#FFFFFF",
      "heightRatio": "0.07"
    },
    "reflection-line": {
      "color": "#F2F2F2",
      "maxWidth": "320px",
      "typography": {
        "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "fontSize": "16px",
        "fontWeight": "400",
        "letterSpacing": "0",
        "lineHeight": "24px"
      }
    },
    "reflection-panel": {
      "background": "#101010",
      "color": "#F2F2F2",
      "maxWidth": "360px",
      "padding": "24px",
      "radius": "4px"
    },
    "scene-caption": {
      "color": "#A8A8A8",
      "typography": {
        "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "fontSize": "12px",
        "fontWeight": "500",
        "letterSpacing": "0.16em",
        "lineHeight": "18px",
        "textTransform": "uppercase"
      }
    },
    "scene-status": {
      "background": "#101010",
      "color": "#A8A8A8",
      "maxWidth": "480px"
    },
    "slab-scene": {
      "aspectRatio": "2.4 / 1",
      "backdrop": "#000000",
      "light": "#FFFFFF",
      "thicknessRatio": "0.025"
    },
    "text-action": {
      "activeColor": "#F2F2F2",
      "color": "#A8A8A8",
      "focusColor": "#E6E6E6",
      "minHeight": "44px",
      "minWidth": "44px",
      "typography": {
        "fontFamily": "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "fontSize": "12px",
        "fontWeight": "400",
        "letterSpacing": "0.04em",
        "lineHeight": "18px",
        "textTransform": "lowercase"
      }
    },
    "threshold": {
      "background": "#000000",
      "color": "#F2F2F2",
      "maxWidth": "480px",
      "paragraphGap": "24px",
      "quoteGap": "48px"
    }
  }
} as const;

export type Tokens = typeof tokens;
