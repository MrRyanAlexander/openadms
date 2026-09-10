# Setting up the OpenRecover organization profile

The file in `profile/README.md` is what GitHub renders at the top of an organization's page. It only works from a repository named exactly `.github` inside the organization.

## Steps

1. **Create the organization.** github.com → your profile menu → Your organizations → New organization. Free plan. Suggested name: `openrecover`.

2. **Create a public repository named `.github`** inside it. The name matters and includes the leading dot.

3. **Copy this folder's `profile/` directory into the root of that repository**, so the tree is:

   ```
   .github/
   └── profile/
       ├── README.md
       └── assets/
           ├── org-banner-dark.svg
           └── org-banner-light.svg
   ```

4. **Push.** The profile renders at `github.com/openrecover` within a minute.

## After moving openadms into the organization

Transferring `MrRyanAlexander/openadms` to the org keeps every star, issue and fork, and GitHub redirects the old URL. Two things then need updating in the openadms repository:

```bash
# From the repo root
grep -rl "MrRyanAlexander/openadms" README.md docs .github CONTRIBUTING.md SECURITY.md \
  | xargs sed -i '' 's|MrRyanAlexander/openadms|openrecover/openadms|g'
```

That covers the CI badge, the issue template contact links, and the clone commands. The `../../` relative links used elsewhere follow the repository automatically and need no change.

Also update `profile/README.md` in the `.github` repository, where the openadms links are absolute.

## Notes

- The banners are the same generated assets the openadms repository uses, in the OpenRecover palette. They carry no webfont dependency, so they render identically wherever GitHub serves them.
- `profile/README.md` is public whether or not the organization has any public repositories.
