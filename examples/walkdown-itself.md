---
title: Walkdown
author: Samir Damle
theme: light
defaults:
  reveal: step
  effect: fade-in
  duration: 500ms
stylesheets:
  - "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap"
  - ./walkdown-theme.css
---

<!-- section: Intro -->

<!-- reveal: all; class: hero -->

# Walkdown

## Walkdown

Simple, magical presentation from Markdown

---

# What it is

- Walkdown turns a Markdown file into a presentation you can walk through, one step at a time.
- It works on a phone, a tablet, and a desktop, and it reshapes itself for each one.
- A deck is a plain Markdown file. Read it as a document, or walk it as a presentation.

---

# Screens, not slides

- A screen is one unit of the walk. Walkdown calls them screens because they are not fixed slides.
- Three dashes on their own line start a new screen. Headings do not.
- A screen holds panels. Panels are the cards you see, and the walk reveals them one step at a time.

---

<!-- section: How it works -->

# Bullets become panels

- Each bullet becomes a panel.
- Three bullets make three panels in a row on a wide screen.
- Six bullets make six panels, two rows of three.
- On a phone the same six panels stack in one column.
- Nothing in the file changes. The layout adapts to the screen it is on.
- Panels are cards. The walk is the order you meet them in.

---

<!-- reveal: step; sequence: 3, 1, 2; effect: fade-in; duration: 1s -->

# The punchline first

- First you write the deck.
- Then you walk it, one step at a time.
- The point of this screen is that order is a choice, not an accident.

---

# Lists inside panels

- A panel can hold more than one line.
  - A nested list stays inside its panel.
  - It never becomes a panel of its own.
  - It never becomes a step of its own.
- So a panel can carry a little structure of its own, without changing the walk.

---

# When a screen is too tall

- A screen has a height, and sometimes the content is taller than it. Walkdown does not shrink the words until they are unreadable, and it does not cut anything off.
- Instead, the screen scrolls inside itself. The deck stays put. You scroll the screen, and you keep walking.
- Type never goes below 12 pixels on a phone. If the words will not fit at a readable size, the screen scrolls sooner.
- Scroll with the wheel, or with the up and down arrows. A swipe up and down scrolls too.
- A long screen is not a failure. It is a screen with more to say, and the reader gets to it by scrolling.
- This screen is deliberately long. Keep scrolling, and you will reach the end of it.
- The next screen starts when you press Next, not when you run out of scroll.
- That is the whole idea: a presentation that can hold a long thought, without turning it into ten tiny slides.

---

<!-- section: Walking -->

# Next and Previous

- Next is the main move. It reveals the next panel, or it takes you to the next screen.
- Previous goes back one step. It hides the last panel you revealed, or it takes you back to the last step of the screen before.
- Start takes you to the first step of the first screen. End takes you to the last step of the last screen.

---

# Scroll or advance, never both

- The wheel and the up and down arrows scroll inside the current screen.
- The right arrow advances. So does a tap on the right half of the screen.
- The left arrow goes back. So does a tap on the left half. One input, one job.
- Plus zooms the type in, minus zooms it out, and the zoom stays with you for the whole deck.
- Tap the screen number to jump — first screen, any Section, or last screen, in a menu just above the controls.

---

<!-- section: Customize; reveal: step; effect: slide-in; duration: 250ms; class: dark -->

# Defaults, then overrides

- Deck defaults live in frontmatter, under `defaults`. They set the reveal, the effect, and the duration for the whole deck.
- A Section can override them for its own screens. This section slides in, faster than the rest of the deck, because its marker says so.
- A screen can override them again. The screen marker is the last word.

---

<!-- reveal: step; class: accent; panel-class: big -->

# Make it look like yours

- A deck can link to an external stylesheet in frontmatter, under `stylesheets`. This deck links to one.
- A CSS block at the end of the file styles this deck only. It is the last block in the file, and the renderer takes it out of the content.
- Classes tie the two together. This screen carries the `accent` class, and every panel on it carries the `big` class.

---

<!-- reveal: step -->

# Make it move

<!-- reveal: effect: fade-in -->
- Fade in is the default: a panel fades and rises a short distance, gentle enough to disappear into the reading. Set it with `effect: fade-in` — or set nothing at all.
<!-- reveal: effect: slide-in -->
- Slide in glides a panel in from the side — from the right going forward, from the left going back. Set it with `effect: slide-in`.
<!-- reveal: effect: zoom-in -->
- Zoom in grows a panel from slightly smaller, with a fade. Set it with `effect: zoom-in` — for a moment you want to land.
- Pick one with the `effect:` key in a reveal marker: on the deck in frontmatter, on a Section, on a screen — or on a single panel, the way this screen does.

---

# Your first deck

- Write a Markdown file. Split it with three dashes. Put a bullet on each idea.
- Walk it. Then change one thing, and walk it again.
- That is Walkdown. Markdown in, a presentation that walks.

```css
/* Open Sans is this deck's default font — deck-scoped, not the
   renderer default (the renderer stays on its system stack).
   The font itself loads from the Google Fonts URL in
   frontmatter; if it cannot load, the stack below falls back
   to the system stack and the deck still renders.
   The theme vars live as inline style on .wd-deck (the
   renderer sets them there on every layout pass), so only an
   !important rule on .wd-deck itself beats them — a :host
   rule would lose to the inline style. */
.wd-deck {
  --wd-font-family-body: 'Open Sans', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  --wd-font-family-title: 'Open Sans', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}

.hero {
  text-align: left;
}

.accent {
  border-left: 4px solid #2E7D6B;
}

.big {
  font-size: 1.125em;
}
```
