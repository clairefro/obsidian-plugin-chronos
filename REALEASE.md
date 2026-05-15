## Release Process

1. Update Versions
    - Update version in manifest.json and package.json.

2. Commit and Push
   git add .
   git commit -m "release: v1.x.x"
   git push origin main

3. Tag and Trigger
   git tag 1.x.x
   git push origin 1.x.x

4. Finalize
    - Check GitHub Actions tab for success.
    - Edit the new GitHub Release to add notes.

## Troubleshooting

To delete a failed tag and retry:
git push --delete origin 1.x.x
git tag -d 1.x.x
