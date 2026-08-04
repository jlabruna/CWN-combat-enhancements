// Versioned entry point prevents browsers and Foundry hosts from retaining an
// older module graph when a patch release keeps the implementation filenames.
// Keep this query version aligned with module.json and package.json.
import "./cwn-combat-enhancements.mjs?v=0.13.7";
