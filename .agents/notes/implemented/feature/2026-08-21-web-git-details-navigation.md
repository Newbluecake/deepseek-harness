# Agent Note: Web git details navigation

Status: implemented

English | [中文](2026-08-21-web-git-details-navigation.zh.md)

## Problem

The file explorer opened the Git changes list and commit graph in one large modal. This made navigation inconsistent with the workspace tree in the details column and treated browsing a file list as an interrupting action.

## Decision

The session details column defaults to the Git changes list. One right-edge Dock replaces the separate file and Terminal reveal controls and keeps fixed entries for the workspace file list, Git changes, Git Tree, and Terminal. Hover or keyboard focus magnifies the target and its neighbors with transforms that do not resize the Dock. The Dock's Git Tree entry opens a compact current-branch commit list in details; its expand control opens the complete all-branch graph modal. Selecting one changed file records its path and staged state in the shared store, and only that selection opens the side-by-side diff overlay. Closing either modal preserves the selected details list beneath it. The Git changes list supports path search and shows the current branch above its files where the file list shows the workspace path. Git Tree shows the branch in its footer and marks it on the HEAD commit.

The header title follows the selected list (`File Explorer`, `Git Diff`, or `Git Tree`) and keeps file list, Git Diff, Git Tree, collapse-all, refresh, and close controls in the same order for both lists; unavailable file-tree actions remain disabled instead of disappearing. The Dock remains fixed at the screen's right edge and renders above Terminal and file-explorer modals, so selecting any file or Git entry closes Terminal and opens the requested view. The code-preview overlay remains independent and continues to open when a workspace file is selected. Selecting a panel or either overlay clears conflicting selections so at most one file overlay is active.

## Alternatives considered

**Keep a unified Git modal with tabs.** This preserves one frame for all Git content, but browsing changes and history remains disconnected from the file explorer navigation model.

**Render the file diff inside the details column.** This avoids every Git modal, but the narrow column cannot present two code versions legibly and would replace the list context during inspection.

## Consequences

Git changes and workspace files share one predictable list location, while the two wide visualizations retain modal space. The shared store owns list selection and modal state. Component coverage pins the default Git changes list, switching to files, opening and closing a file diff, and opening Git Tree without replacing the selected list.
