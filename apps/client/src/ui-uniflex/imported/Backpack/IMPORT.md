# Backpack UniFlex import package

Copy `Backpack.authoring.tsx`, `components/` and `assets/` into the project UI source/resource flow.
Register the entry in the project's UniFlex build manifest, then run its normal AOT and preview commands.

This package includes 4 typed interaction candidates. The view emits
`BackpackAction` actions through `onAction`; bind navigation, inventory or server commands in project code.
