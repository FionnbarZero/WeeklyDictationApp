# Dictation Streak

Copy this folder into another React project and import `DictationStreak` from its `index.ts`. Pass production `rounds`, a required `playAudio` callback, `onExit`, and `onComplete`.

Add `pinyinText` and a `pinyinSteps` entry for every character to enable the built-in input method. The child types one Latin-letter Pinyin syllable, chooses one Chinese character, and repeats until the word is assembled. The completed characters are scored against `targetText`. Native Chinese keyboard composition also remains compatible with the input.

Character candidates appear only after a complete, correctly spelled Pinyin syllable. The first spelling error prompts a retry; the second displays the correct Pinyin and restarts the whole dictated word.

Selecting an incorrect character immediately opens the same foreground correction card, displays the correct character, and restarts the dictated word. Incorrect characters entered through a native keyboard receive the same correction after submission.

Dependencies: `react`, `react-dom`, `lucide-react`.
