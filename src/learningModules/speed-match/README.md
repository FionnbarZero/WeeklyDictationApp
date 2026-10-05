# Shuriken Match

Copy this folder into another React project and import `SpeedMatch` from its `index.ts`. Pass `pairs`, `onExit`, and `onComplete`; `playAudio` is optional. Clicking either side of a pair requests its label through `playAudio`, using `zh-CN` for the left card and `en-US` for the right card. The module owns its runtime and scoped stylesheet.

Dependencies: `react`, `react-dom`, `lucide-react`.

```tsx
import { SpeedMatch, type GamePair } from './speed-match'

<SpeedMatch pairs={pairs satisfies readonly GamePair[]} playAudio={playAudio} onExit={close} onComplete={saveResult} />
```
