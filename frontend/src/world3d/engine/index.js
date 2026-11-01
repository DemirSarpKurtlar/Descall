// Entry of the separately built world engine bundle (vite.world3d.config.js ->
// dist/world3d/engine/engine.js). Babylon.js lives only here: the app bundle never
// imports it, so the marketing first paint and the iOS build carry none of it.
export { WorldEngine } from "./WorldEngine.js";
