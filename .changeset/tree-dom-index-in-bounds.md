---
"@cosyte/ccda": patch
---

The document `editCcda` builds from the read tree no longer reads past the end of the nodes outside the root: when nothing follows the root, it is appended after them. The document built is the same as before, and a caller changes nothing.
