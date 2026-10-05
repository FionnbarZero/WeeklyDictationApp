# Context Gap Dash

Copy this folder into another React project and import `ContextGapDash` from its `index.ts`. Pass context `rounds`, `onExit`, and `onComplete`; supply `playAudio` for sentence and hover audio. The Phaser scenes and all image assets are included.

Dependencies: `react`, `react-dom`, `lucide-react`, `phaser`.

Typography uses the system-provided Kaiti SC Regular face, with KaiTi, STKaiti, and generic serif fallbacks.

The cinematic journey supports one to ten rounds. Larger sets are rejected with a configuration message rather than silently truncated.
