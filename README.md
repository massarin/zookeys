# Zoo Keys

For reference, one-shotted on Claude Opus 5 with the following prompt in about 2 minutes:


> "claude, I'm doing lens classifications on galaxy zoo/the zooniverse project. however, the user interface is super annoying, I have to click at least twice for all objects. it would be way better if I could use keyboard shortcuts to classify the lenses (i.e. A B C X O), O for off-centre. is it possible to write a browser extension or some other kind of tool that could do this? whatever it is, it must be lightweight and easily shareable/useable by others"


A ~250-line userscript that adds keyboard shortcuts to the Zooniverse classification
interface, so one keypress does what currently takes two or three clicks.

| Key | Action |
| --- | --- |
| `A` `B` `C` `X` | pick that answer |
| `O` | pick "Off-centre" |
| `space` / `enter` | press Done / Next |
| `` ` `` | toggle auto-advance |
| `h` or `?` | show/hide the on-screen key list |

With auto-advance on (the default), pressing `A` selects answer A **and** presses Done,
so a full classification is a single keystroke.

## Install

1. **Install a userscript manager.** [Violentmonkey](https://violentmonkey.github.io/)
   (open source, recommended) or [Tampermonkey](https://www.tampermonkey.net/).
   Both work in Firefox, Chrome and Edge.
   - Firefox: <https://addons.mozilla.org/firefox/addon/violentmonkey/>
   - Chrome: <https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag>

2. **Click this link:**
   <https://raw.githubusercontent.com/nataliehogg/zookeys/main/zoo-keys.user.js>

   Your userscript manager will intercept it and offer to install. Click *Confirm
   installation*. That's it — you'll get updates automatically as the script is
   tuned.

3. **Check it.** Go to a classification page — a dark panel should appear
   bottom-right listing the keys.

<details>
<summary>Installing from a local file instead</summary>

Open `zoo-keys.user.js` in an editor, select all, copy. Then click the Violentmonkey
toolbar icon → *Create a new script*, select all in the editor that opens, paste over
it, `Ctrl+S`.

Dragging the file onto a browser tab also works, but only after you grant the
extension "Allow access to file URLs" — and that's awkward under snap-packaged
Firefox. Neither local method gets automatic updates.
</details>

### First run

Press `` ` `` to turn auto-advance **off** and classify one subject manually. Check
that the panel reports clicking the button you expected. Once you trust it, press
`` ` `` again for one-keystroke classifications.

## Before you install: check the built-in shortcuts

Newer Zooniverse projects already support pressing `1`–`9` to select answers on
single-choice tasks. Try that on your project first — if it works, you don't need
this at all. This script exists for the older interface, and for mnemonic letter keys
rather than positional numbers.

## Tuning it for your project

Everything adjustable is in the `CONFIG` block at the top of the script.

The script finds buttons by their **visible text**, not by fragile CSS selectors, so
it survives Zooniverse redesigns. Each binding lists regexes tried in order:

```js
{ key: 'o', label: 'Off-centre', match: [/off[\s-]?cent/i, /^o$/i] },
```

If the answer in your workflow reads "Off-center lens (US spelling)", the first regex
still catches it. To add or rename an answer, add a line:

```js
{ key: 'd', label: 'Dud', match: [/^dud\b/i] },
```

Other knobs:

- `autoAdvance` — set `false` if you'd rather press space yourself.
- `advanceDelay` — bump from `150` ms if Done gets missed on a slow connection.
- `doneMatch` — the submit button's text. Plain `Done` is preferred over
  `Done & Talk` so you aren't dropped into the Talk board.
- `exclude` — text of buttons that must never be treated as answers.

## Releasing a change

Automatic updates only fire when the version number goes up. After editing the
script, **bump `@version` in the header** before pushing — otherwise installed copies
will never notice. Managers check roughly daily, so allow a day for it to propagate,
or tell people to hit *Check for updates* in the extension dashboard.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No panel appears | URL not matched | Add an `@match` line for your project's domain |
| Key shows red "no button matching…" | Answer text differs from the regexes | Edit that binding's `match` list |
| Answer selected but never submits | Done button worded differently, or slow to render | Add its text to `doneMatch`, or raise `advanceDelay` |
| Keys do nothing at all | Manager disabled, or focus is in a text box | Check the toolbar icon; click blank page space |

## Notes and limits

- If a key matches nothing, the panel says so in red rather than silently doing
  nothing — useful when tuning `match` patterns.
- Keys are ignored while you're typing in a text box, so Talk comments still work.
- There's no undo: once Done is pressed the classification is submitted, same as
  clicking. If that worries you, run with `autoAdvance: false` for the first while.
- The listener runs in capture phase so the page can't intercept keys first.

## Licence

Public domain / CC0. Do what you like with it.
