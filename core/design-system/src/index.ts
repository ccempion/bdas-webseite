/**
 * Shared design system — tokens, Tailwind preset, and primitive components.
 * The WordPress theme also consumes the preset so the visual transition is
 * invisible.
 */

export const DESIGN_SYSTEM_VERSION = "0.0.0";

export {
  colors,
  radii,
  shadows,
  motion,
  typography,
  keyframes,
  recipes,
  type Colors,
  type Radii,
  type Shadows,
  type Motion,
  type Typography,
} from "./tokens.js";

export { tailwindPreset } from "./tailwind-preset.js";

export { cx } from "./cx.js";

export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./components/Button.js";
export { Input, type InputProps } from "./components/Input.js";
export { Card, type CardProps } from "./components/Card.js";
export { Alert, type AlertProps, type AlertVariant } from "./components/Alert.js";
export { Form, Label, Field, type LabelProps, type FieldProps } from "./components/Form.js";
