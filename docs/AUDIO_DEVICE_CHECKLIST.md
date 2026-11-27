# Audio real-device checklist (iOS Safari, Android Chrome)

Run on your phone in landscape. Serve the branch (`npm run dev`, then open
`http://<your-computer-LAN-IP>:5173/?audio=1` on the phone; Vite already listens on the LAN).
iOS needs HTTPS for some features but Web Audio works over LAN HTTP. Use wired headphones or the
phone speaker first, then repeat the Bluetooth section. Note the device, OS version and browser
version at the top of your results, and mark each line pass/fail with a comment.

The test scene shows `state`, `out latency` and `base latency` in the Stats panel and a lifecycle
log (context state changes, suspends and resumes) under it. Screenshot those when something fails.

## 1. Unlock (first gesture)
- [ ] Before tapping, nothing plays and the overlay says **TAP TO START AUDIO**.
- [ ] One tap starts audio within ~0.5 s; Stats shows `state running`.
- [ ] Reload; tap somewhere else first (not on the overlay, e.g. the side panel): audio still unlocks.
- [ ] iOS only, silent switch ON before first tap: by default no game sound (expected: the game
      respects the switch). Toggle **ignore silent switch** in System, reload, tap: sound plays with
      the switch on (iOS 17+ with `navigator.audioSession`; older iOS: note the result).

## 2. Backgrounding and returning
- [ ] With rain on and a radio station playing, go to the home screen for 10 s, come back: audio
      resumes once, within ~1 s, no burst of piled-up sounds, no doubled radio.
- [ ] Lock the screen for 30 s, unlock: same.
- [ ] Switch to another tab and back: same.
- [ ] After returning, the radio is later in the same song (not restarted); the log shows a
      `os-suspend` / `os-resume` pair and one `state=running`.
- [ ] Do the cycle 5 times quickly: no stuck silence, no doubled audio, `state` ends `running`.

## 3. Interruptions
- [ ] Phone call (have someone call you) while playing; decline or answer and hang up. Return:
      audio resumes (iOS reports `state=interrupted` then `running` in the log). If it stays silent,
      one tap anywhere must bring it back.
- [ ] Set an alarm/timer to fire while playing: audio ducks or pauses, then resumes.
- [ ] Start music in another app, then return to the game: note whether the other app stops
      (iOS default) and that our audio comes back after one tap if it was paused.
- [ ] Siri / voice assistant invoked and dismissed: audio resumes.

## 4. Silent switch and volume (iOS)
- [ ] Switch toggled mid-play with **ignore silent switch** off: game audio mutes/unmutes with it.
- [ ] With it on: audio keeps playing when the switch is set to silent.
- [ ] Hardware volume buttons change volume smoothly; no clicks.

## 5. Bluetooth
- [ ] Connect Bluetooth headphones. Stats `out latency` (note the value; typical 150–300 ms on
      Bluetooth, 10–40 ms wired/speaker).
- [ ] Press **horn taxi** / UI buttons: note how late the sound feels. Expected: noticeably late on
      Bluetooth; the game never times gameplay to audio, so it's acceptable.
- [ ] Disconnect Bluetooth mid-play: audio moves to the speaker without stopping or doubling.
- [ ] Reconnect: audio moves back.

## 6. Streaming and codecs
- [ ] Stats `codec` shows `opus` (Android Chrome) or `aac` (iOS Safari). Set **rain**, wait for
      thunder: `streamed` becomes > 0 and thunder plays. On iOS the AAC path must work; if it says
      `aac (fallback)` note the iOS version.

## 7. Performance and heat (Low preset on phones)
- [ ] Walk Herald Square scenario for 3 minutes with rain on: no crackles or dropouts.
      Note the `update` ms shown (main-thread audio cost per frame; budget 1.5 ms on Low).
- [ ] Voices `real` never exceeds 24 on Low.
- [ ] Phone doesn't get noticeably warmer than with the main game alone.

## 8. Mix sanity by ear
- [ ] Walk from 34th St into a side street: traffic drops and the street gets "slappier"
      (flutter echo between facades); stepping into Bryant/Madison Square Park opens up.
- [ ] **brownout**: a clunk, the hum and AC units stop, signals stop clicking.
- [ ] **passing car** with `v8_big`: burble, Doppler drop as it passes, then fades round a corner.
- [ ] **dialogue → overhear here**, then walk away: the line cuts with "…" in the subtitle.
- [ ] Interior **diner**: outside muffles, the room gets short and bright; **precinct** longer.
