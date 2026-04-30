export const C = {
  bg_warm:   '#f5f0e8',
  bg_light:  '#eef7fb',
  yellow:    '#fad74f',
  blue_dark: '#005374',
  blue_mid:  '#00709c',
  blue_light:'#75c7e6',
  pink:      '#fc3467',
  green:     '#62d070',
  black:     '#282323',
  white:     '#ffffff',
} as const;

export const ACCENT_CYCLE = [
  C.blue_mid, C.pink, C.green, C.blue_dark,
  C.blue_light, C.pink, C.green, C.blue_mid, C.blue_dark,
];

export const SPRING_SNAPPY = { damping: 14, mass: 0.8, stiffness: 200 };
export const SPRING_SOFT   = { damping: 18, mass: 1.0, stiffness: 120 };
