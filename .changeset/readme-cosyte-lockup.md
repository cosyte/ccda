---
"@cosyte/ccda": patch
---

The README now opens with the Cosyte mark, which follows the reader's color scheme, in place of the per-package banner.

A `<picture>` block above the H1 offers a dark-ground tile behind a `prefers-color-scheme: dark` media query, and carries the light-ground tile as the inner `<img>`. On a renderer that honors the switch, the mark sits on a ground that matches the page it is read on.

**Why the per-package banner goes.** It baked the package name and the one-line tagline into pixels, and the two lines directly beneath it repeated both. The shared lockup reads "Cosyte" while the H1 reads `@cosyte/ccda`, so the strings differ, the duplication goes away, and the heading stays. Nothing else in the README moved, including the H1 and the blockquote tagline.

**The failure mode is safe.** A renderer that strips `<source>` renders the inner `<img>`, so the worst case is a light-ground mark on a dark page, never a missing or broken image. On the npm package page the `<img>` is hoisted out of its `<picture>` by the anchor wrapper, so the light cut renders there, which is the correct one: npmjs.com has no dark mode.

**This construct is verified rather than proposed.** `@cosyte/astm` has carried the identical block since `e1033a0` and `@cosyte/hl7` since `1aee04b`, and on GitHub in dark mode the rendered image resolves to the on-dark tile with `PICTURE` as its parent element. The block was copied out of that README rather than retyped, and both URLs were then diffed byte for byte against it, because a transcription error in one of these URLs is a broken image on a public package page. Both were rechecked here before push and returned `200 image/png`, at 10513 and 10455 bytes.

The alt text describes the mark itself, a plus set in two overlapping rounded squares beside the Cosyte wordmark, rather than the package. It is what a screen reader on the package page reads out, and what a reader gets when the image fails to load, so it says what the image is instead of repeating the heading below it.

No runtime, API, or packaging change. Documentation only.
