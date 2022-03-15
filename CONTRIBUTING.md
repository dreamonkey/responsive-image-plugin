# Contributing

- [Issues and Bugs](#issue)
- [Feature Requests](#feature)
- [Submission Guidelines](#submit-pr)
- [Coding Rules](#rules)
- [Commit Message Guidelines](#commit)

## <a name="issue"></a> Found an Issue?

If you find a bug in the source code or a mistake in the documentation, you can help us by
[submitting an issue](#submit-issue) to our GitHub Repository. Including an issue
reproduction (via CodePen, JsBin, Plunkr, etc.) is the absolute best way to help the team quickly
diagnose the problem.

You can help the team even more and [submit a Pull Request](#submit-pr) with a fix.

## <a name="feature"></a> Want a Feature?

You can _request_ a new feature by [submitting an issue](#submit-issue) to our GitHub
Repository. If you would like to _implement_ a new feature, please submit an issue with
a proposal for your work first, to be sure that we can use it.
Please consider what kind of change it is:

- For a **Major Feature**, first open an issue and outline your proposal so that it can be
  discussed. This will also allow us to better coordinate our efforts, prevent duplication of work,
  and help you to craft the change so that it is successfully accepted into the project.
- **Small Features** can be crafted and directly [submitted as a Pull Request](#submit-pr).

### <a name="submit-issue"></a> Submitting an Issue

Before you submit an issue, search the archive, maybe your question was already answered.

If your issue appears to be a bug, and hasn't been reported, open a new issue.
Help us to maximize the effort we can spend fixing issues and adding new
features by not reporting duplicate issues. Providing the following information will increase the
chances of your issue being dealt with quickly:

- **Overview of the Issue** - if an error is being thrown a non-minified stack trace helps
- **Package Version** - which versions of the package are affected
- **Motivation for or Use Case** - explain what are you trying to do and why the current behavior
  is a bug for you
- **Browsers and Operating System** - is this a problem with all browsers and OS?
- **Reproduce the Error** - provide a live example (using [CodePen][codepen], [JsBin][jsbin],
  [Plunker][plunker], etc.) or a unambiguous set of steps
- **Related Issues** - has a similar issue been reported before?
- **Suggest a Fix** - if you can't fix the bug yourself, perhaps you can point to what might be
  causing the problem (line of code or commit)

### <a name="submit-pr"></a> Submitting a Pull Request (PR)

Before you submit your Pull Request (PR) consider the following guidelines:

- Search for an open or closed PR that relates to your submission. You don't want to duplicate effort.
- Make your changes in a new git branch:

  ```shell
  git checkout -b my-fix-branch dev
  ```

- Create your patch, **including appropriate test cases**.
- Follow our [Coding Rules](#rules).
- Run the full test suite, as described in the [developer documentation](DEV_ENVIRONMENT.md),
  and ensure that all tests pass.
- Commit your changes using a descriptive commit message that follows our
  [commit message conventions](#commit). Adherence to these conventions
  is necessary because release notes are automatically generated from these messages.

  ```shell
  git commit -a
  ```

  Note: the optional commit `-a` command line option will automatically "add" and "rm" edited files.

- Push your branch to GitHub:

  ```shell
  git push my-fork my-fix-branch
  ```

- In GitHub, send a pull request to the `dev` branch.
- If we suggest changes then:

  - Make the required updates.
  - Re-run the full test suites to ensure tests are still passing.
  - Rebase your branch and force push to your GitHub repository (this will update your Pull
    Request):

    ```shell
    git rebase dev -i
    git push -f
    ```

That's it! Thank you for your contribution!

#### After your pull request is merged

After your pull request is merged, you can safely delete your branch and pull the changes
from the main (upstream) repository:

- Delete the remote branch on GitHub either through the GitHub web UI or your local shell as
  follows:

  ```shell
  git push my-fork --delete my-fix-branch
  ```

- Check out the `dev` branch:

  ```shell
  git checkout dev -f
  ```

- Delete the local branch:

  ```shell
  git branch -D my-fix-branch
  ```

- Update your `dev` with the latest upstream version:

  ```shell
  git pull --ff upstream dev
  ```

## <a name="rules"></a> Coding Rules

To ensure consistency throughout the source code, keep these rules in mind as you are working:

- All features or bug fixes **must be tested** by one or more tests.
- All public API methods **must be documented** with TSDoc and .
- We follow [Google's JavaScript Style Guide][js-style-guide].
- We use Prettier as autoformatter.

## <a name="commit"></a> Commit Message Guidelines

We have very precise rules over how our git commit messages can be formatted. This leads to **more
readable messages** that are easy to follow when looking through the **project history**. But also,
we use the git commit messages to **generate the package change log**.

### Commit Message Format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special
format that includes a **type**, a **package**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory. For changes which are shown in the changelog (`fix`, `feat`,
`perf` and `revert`), the **scope** field is mandatory.

The `package` and `scope` fields can be omitted if the change does not affect a specific
package and is not displayed in the changelog (e.g. build changes or refactorings).

Any line of the commit message cannot be longer 100 characters! This allows the message to be easier
to read on GitHub as well as in various git tools.

### Revert

If the commit reverts a previous commit, it should begin with `revert:`, followed by the header of
the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is
the SHA of the commit being reverted.

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing
  semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system, CI configuration or external dependencies
  (example scopes: gulp, broccoli, npm)
- **chore**: Other changes that don't modify `src` or `test` files

### Scope

The scope could be anything specifying place of the commit change.

### Subject

The subject contains succinct description of the change:

- use the imperative, present tense: "change" not "changed" nor "changes"
- don't capitalize first letter
- no dot (.) at the end

### Body

Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** or **Deprecations** and
is also the place to reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines.
The rest of the commit message is then used for this.

**Deprecations** should start with the word `DEPRECATED:`. The rest of the commit message will be
used as content for the note.

[js-style-guide]: https://google.github.io/styleguide/jsguide.html
[codepen]: http://codepen.io/
[jsbin]: http://jsbin.com/
[jsfiddle]: http://jsfiddle.net/
[plunker]: http://plnkr.co/edit
[runnable]: http://runnable.com/
[stackoverflow]: http://stackoverflow.com/
