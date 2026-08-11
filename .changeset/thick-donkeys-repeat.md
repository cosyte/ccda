---
"@cosyte/ccda": patch
---

Docs: name the real reason the branch-and-merge fixture went red, and drop the reading that said the index came back empty.

The note and the test comment covering the unmerged-index case both explained the red CI run as `git ls-files -s` returning no records for the path at all. That is false. The run's own output reads `expected [ Array(1) ] to have a length of 3 but got 1`, and the calls above it assert a clean exit on the add and the commits, so a stage-0 record necessarily existed. What actually happened is that the draft handed its `git merge` no committer identity, so the merge died before it touched the index and left the record the last commit wrote; the premise assertion, written as "not zero means it conflicts", accepted that crash as a conflict. A premise assertion that accepts any non-zero exit accepts a crash.

No behavior change: the scanner, the fixture and every assertion are untouched.
