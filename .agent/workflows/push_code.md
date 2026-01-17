---
description: How to push code changes to the repository
---

# Git Push Workflow

This workflow ensures that all code changes are pushed to the `develop` branch, NOT `main`.

1.  **Check current branch**:
    ```bash
    git branch --show-current
    ```

2.  **If not on `develop`**:
    *   Stash any changes if needed: `git stash`
    *   Checkout develop: `git checkout develop` (or `git checkout -b develop` if it doesn't exist)
    *   Pop stash: `git stash pop`

3.  **Stage and Commit**:
    ```bash
    git add .
    git commit -m "your commit message"
    ```

4.  **Push to Develop**:
    ```bash
    git push origin develop
    ```

> **CRITICAL**: Do NOT push directly to `main`. Always push to `develop`.
