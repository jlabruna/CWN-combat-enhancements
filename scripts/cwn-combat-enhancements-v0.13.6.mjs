// Versioned runtime entry point. The Forge and browser caches can retain an
// older module graph when its URLs do not change between patch releases.
// Loading the implementation through a release-specific URL guarantees that
// the v0.13.6 weapon roll compatibility fixes execute after an update.
import "./cwn-combat-enhancements.mjs?v=0.13.6";
